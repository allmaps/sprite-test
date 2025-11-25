#!/bin/bash

node index.ts "https://raw.githubusercontent.com/tu-delft-heritage/watertijdreis-data/refs/heads/main/content/annotations/01-1874-389916-georef.json" 0.5,1,2
node index.ts "https://sammeltassen.nl/iiif-manifests/allmaps/top25-1.json" 0.25,0.5,1
node index.ts "https://sammeltassen.nl/iiif-manifests/allmaps/bonnebladen-dans-1.json" 0.25,0.5,1
