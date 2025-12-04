import React, { useState, useRef } from 'react';
import './WorkflowOptimizer.css';

const WorkflowOptimizer = () => {
  const [optimalPath, setOptimalPath] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const fileInputRef = useRef(null);

  // -------------------------------
  // UTIL FUNCTIONS
  // -------------------------------
  const calculateDuration = (start, end) => {
    return (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  };

  const isSuccessfulCall = (params) => {
    if (!params || Object.keys(params).length === 0) return true;
    return !Object.values(params).some(v => v === null);
  };

  // -------------------------------
  // GRAPH BUILDING & DIJKSTRA
  // -------------------------------
  const buildGraph = (workflows) => {
    const graph = {};
    const edgeWeights = {};

    workflows.forEach((workflow) => {
      const toolEvents = workflow.events.filter(e => e.action === 'mcp_tool_call');

      if (toolEvents.length > 0) {
        const firstTool = toolEvents[0];
        const duration = calculateDuration(workflow.events[0].timestamp, firstTool.timestamp);
        const key = `START->${firstTool.tool_used}`;
        edgeWeights[key] = edgeWeights[key] || [];
        edgeWeights[key].push({ duration, success: true, caseId: workflow.case_id });
      }

      for (let i = 0; i < toolEvents.length - 1; i++) {
        const current = toolEvents[i];
        const next = toolEvents[i + 1];
        const duration = calculateDuration(current.timestamp, next.timestamp);
        const success = isSuccessfulCall(current.tool_params);
        const weight = success ? duration : duration * 3;

        const key = `${current.tool_used}->${next.tool_used}`;
        edgeWeights[key] = edgeWeights[key] || [];
        edgeWeights[key].push({ duration: weight, success, caseId: workflow.case_id });
      }

      if (toolEvents.length > 0) {
        const lastTool = toolEvents[toolEvents.length - 1];
        const duration = calculateDuration(lastTool.timestamp, workflow.events[workflow.events.length - 1].timestamp);
        const key = `${lastTool.tool_used}->END`;
        edgeWeights[key] = edgeWeights[key] || [];
        edgeWeights[key].push({ duration, success: true, caseId: workflow.case_id });
      }
    });

    Object.entries(edgeWeights).forEach(([key, values]) => {
      const [from, to] = key.split('->');
      const bestEdge = values.reduce((best, current) =>
        current.duration < best.duration ? current : best
      );
      graph[from] = graph[from] || [];
      graph[from].push({ to, weight: bestEdge.duration, metadata: bestEdge });
    });

    return graph;
  };

  const dijkstra = (graph, start, end) => {
    const distances = { [start]: 0 };
    const previous = {};
    const visited = new Set();
    const pq = [{ node: start, distance: 0 }];

    while (pq.length > 0) {
      pq.sort((a, b) => a.distance - b.distance);
      const { node: current, distance: currentDist } = pq.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      if (current === end) break;

      const neighbors = graph[current] || [];
      for (const { to, weight } of neighbors) {
        const distance = currentDist + weight;
        if (distance < (distances[to] || Infinity)) {
          distances[to] = distance;
          previous[to] = current;
          pq.push({ node: to, distance });
        }
      }
    }

    const path = [];
    let current = end;
    while (current) {
      path.unshift(current);
      current = previous[current];
    }

    return { path, distance: distances[end] };
  };

  // -------------------------------
  // ANALYSIS
  // -------------------------------
  const analyzeWorkflows = (workflowData) => {
    try {
      setError(null);

      if (!Array.isArray(workflowData) || workflowData.length === 0) {
        throw new Error('Invalid workflow data. Must be non-empty array.');
      }

      const graph = buildGraph(workflowData);
      const result = dijkstra(graph, 'START', 'END');

      if (!result.path || result.path.length === 0) {
        throw new Error('No valid path found.');
      }

      const actualPaths = workflowData.map(w => {
        const toolEvents = w.events.filter(e => e.action === 'mcp_tool_call');
        return {
          caseId: w.case_id,
          path: ['START', ...toolEvents.map(t => t.tool_used), 'END'],
          toolCount: toolEvents.length,
          duration: w.summary.duration_ms / 1000
        };
      });

      setOptimalPath(result);
      setAnalysis(actualPaths);
      setWorkflows(workflowData);
    } catch (err) {
      setError(err.message);
      console.error(err);
    }
  };

  // -------------------------------
  // FILE UPLOAD
  // -------------------------------
  const handleFileUpload = (file) => {
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setError('Upload a valid JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        analyzeWorkflows(jsonData);
      } catch (err) {
        setError('Invalid JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // -------------------------------
  // VECTOR SEARCH
  // -------------------------------
  const performSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchResults([]);
    try {
      const res = await fetch('http://localhost:3001/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
      setError('Search failed');
    }
  };

  // -------------------------------
  // RENDER
  // -------------------------------
  return (
    <div className="workflow-optimizer">
      {/* HEADER */}
      <div className="header-card">
        <h1>Workflow Path Optimizer</h1>
        <p></p>

        {/* SEARCH BAR */}
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search actions (vector search) DEMO…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button onClick={performSearch}>Search</button>
        </div>

        {/* SEARCH RESULTS */}
        {searchResults.length > 0 && (
          <div className="search-results">
            <h3>Search Results</h3>
            <ul>
              {searchResults.map((r, i) => (
                <li key={i}>
                  {r.name} — {Math.round(r.similarity * 100)}%
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* FILE UPLOAD OR ANALYSIS RESULTS */}
      {!workflows.length ? (
        <div className="upload-card" onClick={() => fileInputRef.current.click()}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => handleFileUpload(e.target.files[0])}
          />
          <h2>Upload Workflow JSON</h2>
          <p>Click to choose a file</p>
        </div>
      ) : (
        <div className="analysis-results">
          <div className="optimal-path-card">
            <h2>Optimal Path</h2>
            <div className="path-display">
              {optimalPath?.path.map((node, i) => (
                <React.Fragment key={i}>
                  <span className={`path-node ${node === 'START' ? 'start' : node === 'END' ? 'end' : 'tool'}`}>
                    {node}
                  </span>
                  {i < optimalPath.path.length - 1 && (
                    <span className="path-arrow">→</span>
                  )}
                </React.Fragment>
              ))}
            </div>
            <div style={{ marginTop: '8px', color: '#94a3b8', fontSize: '14px' }}>
              Total duration: {(optimalPath?.distance || 0).toFixed(2)}s
            </div>
          </div>

          <h3>Actual Paths</h3>
          {analysis?.map((a) => (
            <div key={a.caseId} className="path-card">
              <h3>
                <span className="case-id">{a.caseId}</span>
                <span className="duration">{a.duration.toFixed(2)}s • {a.toolCount} tools</span>
              </h3>
              <div className="path-display">
                {a.path.map((node, i) => (
                  <React.Fragment key={i}>
                    <span className={`path-node ${node === 'START' ? 'start' : node === 'END' ? 'end' : 'tool'}`}>
                      {node}
                    </span>
                    {i < a.path.length - 1 && (
                      <span className="path-arrow">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
};

export default WorkflowOptimizer;
