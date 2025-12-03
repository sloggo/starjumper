import React, { useState, useRef } from 'react';
import './WorkflowOptimizer.css';

const WorkflowOptimizer = () => {
  const [optimalPath, setOptimalPath] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const calculateDuration = (start, end) => {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    return (endTime - startTime) / 1000;
  };

  const isSuccessfulCall = (params) => {
    if (!params || Object.keys(params).length === 0) return true;
    return !Object.values(params).some(v => v === null);
  };

  const buildGraph = (workflows) => {
    const graph = {};
    const edgeWeights = {};

    workflows.forEach(workflow => {
      const toolEvents = workflow.events.filter(e => e.action === 'mcp_tool_call');
      
      if (toolEvents.length > 0) {
        const firstTool = toolEvents[0];
        const startEvent = workflow.events[0];
        const duration = calculateDuration(startEvent.timestamp, firstTool.timestamp);
        
        const key = `START->${firstTool.tool_used}`;
        if (!edgeWeights[key]) edgeWeights[key] = [];
        edgeWeights[key].push({ duration, success: true, caseId: workflow.case_id });
      }

      for (let i = 0; i < toolEvents.length - 1; i++) {
        const current = toolEvents[i];
        const next = toolEvents[i + 1];
        const duration = calculateDuration(current.timestamp, next.timestamp);
        const success = isSuccessfulCall(current.tool_params);
        
        const key = `${current.tool_used}->${next.tool_used}`;
        if (!edgeWeights[key]) edgeWeights[key] = [];
        
        const weight = success ? duration : duration * 3;
        edgeWeights[key].push({ duration: weight, success, caseId: workflow.case_id });
      }

      if (toolEvents.length > 0) {
        const lastTool = toolEvents[toolEvents.length - 1];
        const endEvent = workflow.events[workflow.events.length - 1];
        const duration = calculateDuration(lastTool.timestamp, endEvent.timestamp);
        
        const key = `${lastTool.tool_used}->END`;
        if (!edgeWeights[key]) edgeWeights[key] = [];
        edgeWeights[key].push({ duration, success: true, caseId: workflow.case_id });
      }
    });

    Object.entries(edgeWeights).forEach(([key, values]) => {
      const [from, to] = key.split('->');
      const bestEdge = values.reduce((best, current) => 
        current.duration < best.duration ? current : best
      );
      
      if (!graph[from]) graph[from] = [];
      graph[from].push({
        to,
        weight: bestEdge.duration,
        metadata: bestEdge
      });
    });

    return graph;
  };

  const dijkstra = (graph, start, end) => {
    const distances = { [start]: 0 };
    const previous = {};
    const metadata = {};
    const visited = new Set();
    const pq = [{ node: start, distance: 0 }];

    while (pq.length > 0) {
      pq.sort((a, b) => a.distance - b.distance);
      const { node: current, distance: currentDist } = pq.shift();

      if (visited.has(current)) continue;
      visited.add(current);

      if (current === end) break;

      const neighbors = graph[current] || [];
      for (const { to, weight, metadata: meta } of neighbors) {
        const distance = currentDist + weight;
        
        if (distance < (distances[to] || Infinity)) {
          distances[to] = distance;
          previous[to] = current;
          metadata[to] = meta;
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

    return { path, distance: distances[end], metadata };
  };

  const analyzeWorkflows = (workflowData) => {
    try {
      setError(null);
      
      if (!Array.isArray(workflowData) || workflowData.length === 0) {
        throw new Error('Invalid workflow data: Expected a non-empty array');
      }

      const graph = buildGraph(workflowData);
      const result = dijkstra(graph, 'START', 'END');
      
      if (!result.path || result.path.length === 0) {
        throw new Error('Could not find a valid path through the workflows');
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
      console.error('Analysis error:', err);
    }
  };

  const handleFileUpload = (file) => {
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setError('Please upload a valid JSON file');
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        analyzeWorkflows(jsonData);
      } catch (err) {
        setError('Invalid JSON format: ' + err.message);
      }
    };

    reader.onerror = () => {
      setError('Error reading file');
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    handleFileUpload(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    setOptimalPath(null);
    setAnalysis(null);
    setWorkflows([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="workflow-optimizer">
      <div className="header-card">
        <h1>Workflow Path Optimizer</h1>
        <p>Process mining analysis to discover the optimal path through agent workflows</p>
      </div>

      {!workflows.length ? (
        <div 
          className={`upload-card ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
          
          <div className="upload-icon">📁</div>
          <h2>Upload Workflow Data</h2>
          <p>Drag and drop your JSON file here or click to browse</p>
          
          <div className="upload-requirements">
            <div className="requirement">✓ JSON format</div>
            <div className="requirement">✓ Array of workflow objects</div>
            <div className="requirement">✓ Must include events with mcp_tool_call actions</div>
          </div>
        </div>
      ) : (
        <div className="data-loaded-card">
          <div className="loaded-info">
            <span className="success-icon">✓</span>
            <div>
              <strong>{workflows.length} workflows loaded</strong>
              <div className="loaded-details">
                Total tool calls: {workflows.reduce((sum, w) => sum + w.summary.tool_calls, 0)}
              </div>
            </div>
          </div>
          <button onClick={handleReset} className="reset-button">
            Upload Different File
          </button>
        </div>
      )}

      {error && (
        <div className="error-card">
          <span className="error-icon">⚠️</span>
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {optimalPath && (
        <div className="optimal-path-card">
          <h2>✓ Optimal Path Discovered</h2>
          
          <div className="path-visualization">
            <div className="path-steps">
              {optimalPath.path.map((step, idx) => (
                <React.Fragment key={idx}>
                  <div className={`step ${step === 'START' || step === 'END' ? 'endpoint' : 'tool'}`}>
                    {step}
                  </div>
                  {idx < optimalPath.path.length - 1 && <span className="arrow">→</span>}
                </React.Fragment>
              ))}
            </div>
            
            <div className="metrics">
              <div className="metric">
                <div className="metric-label">Tool Calls</div>
                <div className="metric-value">{optimalPath.path.length - 2}</div>
              </div>
              
              <div className="metric">
                <div className="metric-label">Estimated Time</div>
                <div className="metric-value">{optimalPath.distance.toFixed(2)}s</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {analysis && (
        <div className="comparison-card">
          <h2>Workflow Comparison</h2>
          
          <div className="workflows">
            {analysis.map((workflow, idx) => {
              const timeSaved = workflow.duration - optimalPath.distance;
              const efficiency = (optimalPath.distance / workflow.duration) * 100;
              const isOptimal = workflow.toolCount === (optimalPath.path.length - 2) && 
                               Math.abs(workflow.duration - optimalPath.distance) < 0.1;
              
              return (
                <div key={idx} className={`workflow ${isOptimal ? 'optimal' : ''}`}>
                  <div className="workflow-header">
                    <div>
                      <h3>
                        Workflow {idx + 1}
                        {isOptimal && <span className="badge">OPTIMAL</span>}
                      </h3>
                      <div className="case-id">{workflow.caseId}</div>
                    </div>
                    
                    <div className="workflow-stats">
                      <div className="duration">{workflow.duration.toFixed(1)}s</div>
                      <div className="tool-count">{workflow.toolCount} tool calls</div>
                    </div>
                  </div>
                  
                  <div className="workflow-path">
                    {workflow.path.map((step, stepIdx) => (
                      <React.Fragment key={stepIdx}>
                        <span className={`step-label ${step === 'START' || step === 'END' ? 'endpoint' : 'tool'}`}>
                          {step}
                        </span>
                        {stepIdx < workflow.path.length - 1 && <span className="arrow-small">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                  
                  {!isOptimal && (
                    <div className="workflow-analysis">
                      <div className="efficiency">
                        📉 {efficiency.toFixed(0)}% efficient
                      </div>
                      <div className="time-wasted">
                        ⏱️ +{timeSaved.toFixed(1)}s wasted ({(timeSaved/workflow.duration*100).toFixed(0)}%)
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowOptimizer;