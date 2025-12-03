import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime

file = "../data/customer_support_event_log.csv"

dataset = pd.read_csv(file)

print(dataset.head())
