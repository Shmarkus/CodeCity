# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Code City is a universal source code visualizer that renders any codebase as a 3D city where packages are districts and classes are buildings (height = lines of code). Built for durability using only bash scripts and vanilla web technologies (HTML/CSS/JavaScript) with zero dependencies.

## Development Commands

### Data Generation
```bash
# Make script executable (first time only)
chmod +x generate-city-data.sh

# Generate visualization data from a source directory
./generate-city-data.sh /path/to/source output.json

# Example: analyze this repository
./generate-city-data.sh . data.json
```

### Testing
```bash
# Validate generated JSON
cat output.json | python -m json.tool

# Test with sample data (no external source needed)
# Simply open index.html with data.json in the same directory
```

### Running the Visualizer
```bash
# No build step required - just open in browser
# Ensure data.json (or your output file) is in the same directory as index.html
# Open index.html in any modern browser (Chrome, Firefox, Safari, Edge)
```

## Architecture

### Two-Part Design

**1. Data Generator (generate-city-data.sh)**
- Pure bash script using standard Unix tools (find, grep, sed, awk, wc)
- Scans source files for package/namespace declarations and class/type definitions
- **Automatically excludes test files** matching pattern `*Test.<extension>`
- Counts non-blank, non-comment lines of code per class
- Outputs JSON in format: `{packages: [{name, classes: [{name, linesOfCode}]}]}`
- Language support configured via three arrays:
  - `FILE_EXTENSIONS`: Space-separated list of file extensions to scan
  - `PACKAGE_PATTERNS`: Array of "ext:grep_pattern:sed_extraction" entries
  - `CLASS_PATTERNS`: Array of "ext:grep_pattern:awk_field" entries

**2. Visualizer (index.html + visualizer.js)**
- Vanilla JavaScript with no frameworks or dependencies
- **Dual-loading architecture** for CORS-free operation:
  - Attempts to fetch data.json automatically (works with web servers)
  - Falls back to file input UI on error (works with file:// protocol)
  - Uses FileReader API for local file loading (browser-native, no dependencies)
- Renders packages as bordered rectangles containing buildings
- Buildings are positioned in grid layout (sorted tallest-first for visual balance)
- Interactive: hover for details, click to select
- Configuration object (`CONFIG` in visualizer.js) controls:
  - `buildingWidth`, `buildingSpacing`: Building dimensions
  - `packagePadding`, `packageSpacing`: Package layout
  - `locToHeightScale`: Lines of code to pixel height ratio (default: 0.5)

### Data Flow
```
Source Code → Bash Script → JSON → JavaScript → DOM (rendered city)
```

### Key Functions

**generate-city-data.sh:**
- `extract_package_name()`: Parses package/namespace from file using language-specific patterns
- `extract_class_name()`: Parses class/type name from file using language-specific patterns
- `count_lines_of_code()`: Counts non-blank lines excluding // and # comments
- `generate_json()`: Aggregates CSV data into nested JSON structure using awk

**visualizer.js:**
- `loadData()`: Attempts to fetch data.json, falls back to file input on failure
- `setupFileInput()`: Configures FileReader to handle user-uploaded JSON files
- `showFileInputPrompt()`: Displays file selector UI when automatic loading fails
- `renderCity()`: Main rendering loop, positions packages with wrapping
- `calculatePackageLayout()`: Computes optimal grid layout for buildings in a package
- `createBuildingElement()`: Creates DOM element with hover/click handlers
- `displayProjectStats()`: Calculates and displays aggregate metrics

## Adding Language Support

To add a new language, edit `generate-city-data.sh`:

1. Add file extension to `FILE_EXTENSIONS` (line 24)
2. Add package pattern to `PACKAGE_PATTERNS` (lines 28-35):
   - Format: `"ext:grep_pattern:sed_extraction"`
   - Example: `"rs:^mod :s/mod //;s/ //g"` for Rust modules
3. Add class pattern to `CLASS_PATTERNS` (lines 39-46):
   - Format: `"ext:grep_pattern:awk_field_number"`
   - Example: `"rs:^[[:space:]]*struct :2"` for Rust structs
4. If language has unique comment syntax, update `count_lines_of_code()` (lines 135-148)

## Visualization Customization

Edit `visualizer.js` `CONFIG` object (lines 4-10):
- Increase `locToHeightScale` to make buildings taller
- Adjust `buildingWidth` to change building footprint
- Modify `buildingSpacing` or `packagePadding` to change density

Edit CSS in `index.html`:
- `.building` gradient (lines 60-61) for building colors
- `.building:hover` (lines 68-73) for hover effects
- `.building.selected` (lines 75-78) for selection color

## File Organization

- `generate-city-data.sh`: Data generator (bash)
- `index.html`: Visualizer UI with embedded CSS
- `visualizer.js`: Rendering logic (vanilla JS)
- `data.json`: Sample/current visualization data (gitignored)
- `README.md`: User-facing documentation

## Design Philosophy

This codebase prioritizes longevity and simplicity:
- No package.json, no npm, no build tools
- Only standard Unix utilities (available everywhere)
- Vanilla web standards (will work in 10+ years)
- ~200 lines bash + ~300 lines JavaScript
- Comments are minimal but code is self-documenting
- **Browser-native APIs only**: FileReader, fetch, DOM manipulation (no polyfills needed)

When modifying, maintain these principles:
- Avoid adding dependencies (npm packages, frameworks, libraries)
- Keep functions small and single-purpose
- Use standard tools over specialized ones
- Prioritize readability over cleverness
- Prefer browser-native APIs over third-party solutions

## CORS and File Loading

The visualizer handles both server and local file scenarios:
- **Server mode (http://localhost:8000)**: Automatic fetch of data.json
- **Local mode (file:///path/to/index.html)**: FileReader API with file input UI
- The dual-loading approach maintains zero dependencies while avoiding CORS issues
- FileReader is supported in all modern browsers and doesn't require server setup
