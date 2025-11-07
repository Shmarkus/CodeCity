#!/usr/bin/env bash

################################################################################
# Code City Data Generator
#
# Purpose: Analyze source code and generate JSON for visualization
# Works with: Java, C#, PHP, Python, Go, TypeScript, or any language
#
# This script counts non-blank lines of code per class/file and organizes
# them by package/namespace for the Code City visualizer.
#
# Usage: ./generate-city-data.sh [OPTIONS] <source-directory> <output-file>
# Example: ./generate-city-data.sh ./src city-data.json
# Options: --no-git  Skip git metadata collection
################################################################################

set -euo pipefail  # Exit on error, undefined variables, pipe failures

# Default options
COLLECT_GIT_DATA=true

################################################################################
# CONFIGURATION
################################################################################

# File extensions to analyze (add more as needed)
# Space-separated list
FILE_EXTENSIONS="java cs php py go ts js"

# Patterns to detect package/namespace declarations
# Format: "extension:grep_pattern:sed_extraction"
PACKAGE_PATTERNS=(
    "java:^package :s/package //;s/;//;s/ //g"
    "cs:^namespace :s/namespace //;s/;//;s/ //g;s/{//g"
    "php:^namespace :s/namespace //;s/;//;s/ //g"
    "py:^# package: :s/# package: //;s/ //g"
    "go:^package :s/package //;s/ //g"
    "ts:^export namespace :s/export namespace //;s/ //g;s/{//g"
)

# Patterns to detect class/type declarations
# Format: "extension:grep_pattern:extraction_method"
# extraction_method can be a field number or "sed" for sed-based extraction
CLASS_PATTERNS=(
    "java:^[[:space:]]*(public|private|protected)?[[:space:]]*(static)?[[:space:]]*(final)?[[:space:]]*(class|enum|interface|@interface|record)[[:space:]]:sed"
    "cs:^[[:space:]]*(public|private|protected|internal)?[[:space:]]*(static)?[[:space:]]*(sealed)?[[:space:]]*class :3"
    "php:^[[:space:]]*(final)?[[:space:]]*class :2"
    "py:^class :2"
    "go:^type :2"
    "ts:^[[:space:]]*(export)?[[:space:]]*class :2"
)

################################################################################
# FUNCTIONS
################################################################################

# Print error message and exit
function error_exit() {
    echo "ERROR: $1" >&2
    exit 1
}

# Print usage information
function show_usage() {
    echo "Usage: $0 <source-directory> <output-file>"
    echo ""
    echo "Example:"
    echo "  $0 ./src city-data.json"
    echo ""
    echo "Supported file types: $FILE_EXTENSIONS"
    exit 1
}

# Get file extension from filename
function get_file_extension() {
    local filename="$1"
    echo "${filename##*.}"
}

# Extract package/namespace name from a source file
function extract_package_name() {
    local file="$1"
    local extension="$2"
    
    # Look through package patterns for matching extension
    for pattern_entry in "${PACKAGE_PATTERNS[@]}"; do
        local pattern_ext="${pattern_entry%%:*}"
        local pattern_rest="${pattern_entry#*:}"
        local grep_pattern="${pattern_rest%%:*}"
        local sed_pattern="${pattern_rest#*:}"
        
        if [[ "$extension" == "$pattern_ext" ]]; then
            # Try to extract package name
            local package_line
            package_line=$(grep "$grep_pattern" "$file" 2>/dev/null | head -n 1 || true)
            
            if [[ -n "$package_line" ]]; then
                echo "$package_line" | sed "$sed_pattern"
                return
            fi
        fi
    done
    
    # Default: use directory path as package name
    local dir_path
    dir_path=$(dirname "$file")
    echo "${dir_path}" | sed 's|/|.|g' | sed 's|^\.*||'
}

# Extract class/type name from a source file
function extract_class_name() {
    local file="$1"
    local extension="$2"
    
    # Look through class patterns for matching extension
    for pattern_entry in "${CLASS_PATTERNS[@]}"; do
        local pattern_ext="${pattern_entry%%:*}"
        local pattern_rest="${pattern_entry#*:}"
        # Parse from the end to avoid splitting on colons inside [[:space:]]
        local awk_field="${pattern_rest##*:}"
        local grep_pattern="${pattern_rest%:*}"
        
        if [[ "$extension" == "$pattern_ext" ]]; then
            # Try to extract class name
            local class_line
            class_line=$(grep -E "$grep_pattern" "$file" 2>/dev/null | head -n 1 || true)
            
            if [[ -n "$class_line" ]]; then
                # Extract the class name
                if [[ "$awk_field" == "sed" ]]; then
                    # Use sed to extract name after class/enum/interface/record keyword
                    echo "$class_line" | sed -E 's/^.*\<(class|enum|interface|@interface|record)[[:space:]]+([A-Za-z0-9_]+).*/\2/'
                else
                    # Use awk field extraction (remove { and other characters)
                    echo "$class_line" | awk "{print \$$awk_field}" | sed 's/{//g' | sed 's/ //g'
                fi
                return
            fi
        fi
    done
    
    # Default: use filename without extension
    basename "$file" ".$extension"
}

# Count non-blank lines in a file (excluding comments)
function count_lines_of_code() {
    local file="$1"

    # Count lines that:
    # - Are not blank (have at least one non-whitespace character)
    # - Do not start with // (single-line comments for Java/C#/etc)
    # - Do not start with # (comments for Python/Shell/etc)

    grep -v "^[[:space:]]*$" "$file" \
        | grep -v "^[[:space:]]*\/\/" \
        | grep -v "^[[:space:]]*#" \
        | wc -l \
        | tr -d ' '
}

# Extract git metadata for a file
function extract_git_metadata() {
    local file="$1"
    local file_dir=$(dirname "$file")

    # Check if file is in a git repository (check from file's directory)
    if ! (cd "$file_dir" && git rev-parse --git-dir > /dev/null 2>&1); then
        echo ""
        return
    fi

    # Check if file is tracked by git (run from file's directory)
    if ! (cd "$file_dir" && git ls-files --error-unmatch "$(basename "$file")" > /dev/null 2>&1); then
        echo ""
        return
    fi

    # Get commit count (use absolute path for file)
    local commits
    commits=$(cd "$file_dir" && git log --follow --format="%H" -- "$(basename "$file")" 2>/dev/null | wc -l | tr -d ' ')

    # Get unique author count
    local authors
    authors=$(cd "$file_dir" && git log --follow --format="%an" -- "$(basename "$file")" 2>/dev/null | sort -u | wc -l | tr -d ' ')

    # Get last modified date (ISO 8601 format)
    local last_modified
    last_modified=$(cd "$file_dir" && git log -1 --format="%ai" -- "$(basename "$file")" 2>/dev/null || echo "")

    # If no commits found, return empty
    if [[ "$commits" == "0" ]]; then
        echo ""
        return
    fi

    # Format last_modified to ISO 8601 with timezone
    if [[ -n "$last_modified" ]]; then
        # Convert to ISO format: 2025-11-07T10:30:00Z
        last_modified=$(date -d "$last_modified" -Iseconds 2>/dev/null || echo "$last_modified")
    fi

    # Return JSON fragment
    echo ",\"gitMetadata\":{\"commits\":$commits,\"authors\":$authors,\"lastModified\":\"$last_modified\"}"
}

# Find all source files in the directory
function find_source_files() {
    local source_dir="$1"
    
    # Build find command with all extensions
    local find_args=()
    local first=true
    
    for ext in $FILE_EXTENSIONS; do
        if [[ "$first" == true ]]; then
            find_args+=( "-name" "*.${ext}" )
            first=false
        else
            find_args+=( "-o" "-name" "*.${ext}" )
        fi
    done
    
    # Execute find command and filter out test files
    find "$source_dir" -type f \( "${find_args[@]}" \) | grep -v 'Test\.[^/]*$'
}

# Analyze a single source file
function analyze_file() {
    local file="$1"
    local extension
    local package_name
    local class_name
    local lines_of_code
    local git_metadata

    extension=$(get_file_extension "$file")
    package_name=$(extract_package_name "$file" "$extension")
    class_name=$(extract_class_name "$file" "$extension")
    lines_of_code=$(count_lines_of_code "$file")

    # Extract git metadata if enabled
    git_metadata=""
    if [[ "$COLLECT_GIT_DATA" == "true" ]]; then
        git_metadata=$(extract_git_metadata "$file")
    fi

    # Output as CSV with optional git metadata
    # Format: package,class,loc,git_json_fragment
    echo "${package_name},${class_name},${lines_of_code},${git_metadata}"
}

# Convert CSV data to JSON format
function generate_json() {
    local csv_data="$1"
    local output_file="$2"

    # Use awk to aggregate data by package and generate JSON
    # CSV format: package,class,loc,git_metadata_json_fragment
    echo "$csv_data" | awk -F, '
    BEGIN {
        print "{"
        print "  \"packages\": ["
    }

    # Store data in arrays indexed by package
    {
        package = $1
        class = $2
        loc = $3

        # Git metadata is everything after the 3rd comma (may contain commas)
        git_meta = ""
        for (i = 4; i <= NF; i++) {
            git_meta = git_meta (i > 4 ? "," : "") $i
        }

        # Skip empty lines
        if (package == "" || class == "") next

        # Build class JSON with optional git metadata
        class_json = sprintf("{\"name\": \"%s\", \"linesOfCode\": %s%s}", class, loc, git_meta)

        # Store class data
        packages[package] = packages[package] (packages[package] ? "," : "") class_json

        # Track package order
        if (!(package in seen)) {
            order[++count] = package
            seen[package] = 1
        }
    }

    END {
        # Output each package
        for (i = 1; i <= count; i++) {
            package = order[i]

            if (i > 1) print ","

            printf "    {\n"
            printf "      \"name\": \"%s\",\n", package
            printf "      \"classes\": [\n"
            printf "        %s\n", packages[package]
            printf "      ]\n"
            printf "    }"
        }

        print ""
        print "  ]"
        print "}"
    }
    ' > "$output_file"
}

################################################################################
# MAIN SCRIPT
################################################################################

function main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-git)
                COLLECT_GIT_DATA=false
                shift
                ;;
            -*)
                echo "Unknown option: $1" >&2
                show_usage
                ;;
            *)
                break
                ;;
        esac
    done

    # Check remaining arguments
    if [[ $# -ne 2 ]]; then
        show_usage
    fi

    local source_directory="$1"
    local output_file="$2"
    
    # Validate source directory exists
    if [[ ! -d "$source_directory" ]]; then
        error_exit "Source directory does not exist: $source_directory"
    fi
    
    echo "Analyzing source code in: $source_directory"
    echo "Output will be written to: $output_file"

    if [[ "$COLLECT_GIT_DATA" == "true" ]]; then
        # Check if source directory is in a git repository
        if (cd "$source_directory" && git rev-parse --git-dir > /dev/null 2>&1); then
            echo "Git data collection: ENABLED"
        else
            echo "Git data collection: DISABLED (not a git repository)"
            COLLECT_GIT_DATA=false
        fi
    else
        echo "Git data collection: DISABLED (--no-git flag)"
    fi
    echo ""
    
    # Find and analyze all source files
    local csv_data=""
    local file_count=0
    
    while IFS= read -r source_file; do
        echo "Analyzing: $source_file"

        # Analyze the file and append to CSV data
        local file_data
        file_data=$(analyze_file "$source_file")

        if [[ -n "$file_data" ]]; then
            csv_data="${csv_data}${file_data}"$'\n'
            ((file_count++))
        fi
    done < <(find_source_files "$source_directory") || true
    
    echo ""
    echo "Analyzed $file_count files"
    echo "Generating JSON..."
    
    # Generate JSON from CSV data
    generate_json "$csv_data" "$output_file"
    
    echo ""
    echo "✓ Success! Data written to: $output_file"
    echo ""
    echo "To visualize, open index.html in a browser with $output_file in the same directory."
}

# Run main function
main "$@"
