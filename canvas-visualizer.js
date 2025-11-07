// Code City 3D Isometric Visualizer - Pure Canvas (no dependencies)

// Configuration
const CONFIG = {
    buildingWidth: 30,
    buildingDepth: 30,
    buildingSpacing: 5,
    packagePadding: 20,
    packageSpacing: 0,
    locToHeightScale: 0.8,  // 1 LOC = 0.8px height
    minBuildingHeight: 10,

    // Building size variation based on LOC
    minBuildingWidth: 20,
    maxBuildingWidth: 80,
    minBuildingDepth: 20,
    maxBuildingDepth: 80,

    // Isometric projection angles
    isoAngle: Math.PI / 6,  // 30 degrees

    // Colors
    packageColor: '#7f8c8d',
    packageHighlight: '#95a5a6',
    buildingBaseColor: '#34495e',
    buildingHighlightColor: '#3498db',
    buildingSelectedColor: '#e74c3c',
    backgroundColor: '#2c3e50',
    shadowColor: 'rgba(0, 0, 0, 0.3)',

    // Camera/View
    offsetX: 100,
    offsetY: 100,
    scale: 1,

    // Layout strategy: 'quadrant' or 'grid'
    layoutStrategy: 'quadrant',

    // Git visualization options
    showGitData: true,
    gitVisualization: {
        showFrequency: true,
        showAge: true,
        showRecentGlow: true
    },
    colorBlindMode: false,

    // Normalization values (set after loading data)
    gitNormalization: {
        maxCommits: 0,
        maxAuthors: 0,
        oldestDate: null,
        newestDate: null
    }
};

let projectData = null;
let selectedBuilding = null;
let hoveredBuilding = null;
let canvas, ctx;
let buildings = [];
let packages = [];
let gitColorManager = null;

// Panning state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOffsetX = 0;
let panOffsetY = 0;

// Load and render on page load
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    // Set canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Setup mouse interaction
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // Setup controls
    setupGitControls();
    setupLayoutControls();

    // Load data
    loadData();
    setupFileInput();
});

// Resize canvas to fill container
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    if (projectData) {
        renderCity(projectData);
    }
}

// Load the JSON data (same logic as original visualizer)
function loadData() {
    fetch('./data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load data');
            }
            return response.json();
        })
        .then(data => {
            projectData = data;
            processData(data);
            renderCity();
            displayProjectStats(data);
        })
        .catch(error => {
            console.error('Error loading data:', error);
            showFileInputPrompt();
        });
}

// Show the file input section when automatic loading fails
function showFileInputPrompt() {
    document.getElementById('file-input-section').style.display = 'block';
    ctx.fillStyle = '#95a5a6';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📁', canvas.width / 2, canvas.height / 2 - 40);
    ctx.fillText('Please select a data.json file to visualize', canvas.width / 2, canvas.height / 2);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#7f8c8d';
    ctx.fillText('Use the file selector in the panel on the right →', canvas.width / 2, canvas.height / 2 + 30);
}

// Setup file input handler (same as original visualizer)
function setupFileInput() {
    const fileInput = document.getElementById('dataFileInput');
    const fileStatus = document.getElementById('file-status');

    if (!fileInput) return;

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];

        if (!file) return;

        fileStatus.textContent = 'Loading ' + file.name + '...';
        fileStatus.style.color = '#3498db';

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (!data.packages || !Array.isArray(data.packages)) {
                    throw new Error('Invalid data format: missing packages array');
                }

                projectData = data;
                processData(data);
                renderCity();
                displayProjectStats(data);

                fileStatus.textContent = '✓ Successfully loaded ' + file.name;
                fileStatus.style.color = '#27ae60';

                setTimeout(() => {
                    document.getElementById('file-input-section').style.display = 'none';
                }, 2000);

            } catch (error) {
                console.error('Error parsing JSON:', error);
                fileStatus.textContent = '✗ Error: ' + error.message;
                fileStatus.style.color = '#e74c3c';
            }
        };

        reader.onerror = (error) => {
            console.error('Error reading file:', error);
            fileStatus.textContent = '✗ Error reading file';
            fileStatus.style.color = '#e74c3c';
        };

        reader.readAsText(file);
    });
}

// Isometric projection: convert 3D coordinates to 2D isometric view
function toIsometric(x, y, z) {
    const isoX = (x - y) * Math.cos(CONFIG.isoAngle);
    const isoY = (x + y) * Math.sin(CONFIG.isoAngle) - z;

    return {
        x: isoX * CONFIG.scale + CONFIG.offsetX,
        y: isoY * CONFIG.scale + CONFIG.offsetY
    };
}

// Calculate total lines of code for a package
function calculatePackageMass(pkg) {
    return pkg.classes.reduce((sum, cls) => sum + cls.linesOfCode, 0);
}

// Calculate building footprint based on LOC for visual variety
function calculateBuildingFootprint(linesOfCode) {
    // Use square root scaling so footprint grows slower than height
    // Small classes: ~20x20, Medium: ~30x30, Large (200+): ~50x50, Very large (500+): ~80x80
    const scaleFactor = Math.sqrt(linesOfCode / 50); // Adjust denominator to control growth rate

    const width = Math.min(
        CONFIG.maxBuildingWidth,
        Math.max(CONFIG.minBuildingWidth, CONFIG.buildingWidth * scaleFactor)
    );

    const depth = Math.min(
        CONFIG.maxBuildingDepth,
        Math.max(CONFIG.minBuildingDepth, CONFIG.buildingDepth * scaleFactor)
    );

    return { width, depth };
}

// Layout packages in a quadrant-based strategy (downtown in center, suburbs on edges)
function layoutPackagesQuadrant(packagesWithMass) {
    // Divide into quartiles for quadrant placement
    const quartileSize = Math.ceil(packagesWithMass.length / 4);
    const q1 = packagesWithMass.slice(0, quartileSize);                          // Largest (center)
    const q2 = packagesWithMass.slice(quartileSize, quartileSize * 2);           // Large (right)
    const q3 = packagesWithMass.slice(quartileSize * 2, quartileSize * 3);       // Medium (bottom)
    const q4 = packagesWithMass.slice(quartileSize * 3);                         // Smallest (left)

    // Calculate appropriate row width based on number of packages to make layout more square
    // Aim for roughly square layout within each quadrant
    const packagesPerQuadrant = Math.ceil(packagesWithMass.length / 4);
    const packagesPerRowInQuadrant = Math.ceil(Math.sqrt(packagesPerQuadrant));
    const estimatedPackageSize = 150; // Average package width estimate
    const maxRowWidth = packagesPerRowInQuadrant * estimatedPackageSize;

    // Layout each quadrant
    const quadrants = [
        { packages: q1, startX: maxRowWidth, startY: maxRowWidth },   // Center (downtown)
        { packages: q2, startX: maxRowWidth * 2, startY: 0 },         // Right
        { packages: q3, startX: 0, startY: maxRowWidth * 2 },         // Bottom
        { packages: q4, startX: 0, startY: 0 }                        // Top-left
    ];

    quadrants.forEach(quadrant => {
        layoutPackagesInRegion(quadrant.packages, quadrant.startX, quadrant.startY, maxRowWidth);
    });
}

// Layout packages in a simple grid (largest to smallest, left to right, top to bottom)
function layoutPackagesGrid(packagesWithMass) {
    // Calculate row width to make layout roughly square
    const packagesPerRow = Math.ceil(Math.sqrt(packagesWithMass.length));
    const estimatedPackageSize = 150;
    const maxRowWidth = packagesPerRow * estimatedPackageSize;

    layoutPackagesInRegion(packagesWithMass, 0, 0, maxRowWidth);
}

// Layout packages in a specific region with wrapping
function layoutPackagesInRegion(packagesWithMass, startX, startY, maxRowWidth) {
    let packageX = startX;
    let packageY = startY;
    let maxRowHeight = 0;

    packagesWithMass.forEach((pkgWithMass, idx) => {
        const pkg = pkgWithMass.pkg;
        const pkgLayout = calculatePackageLayout(pkg);

        // Check if we need to wrap to next row
        if (idx > 0 && packageX - startX + pkgLayout.width > maxRowWidth) {
            packageX = startX;
            packageY += maxRowHeight + CONFIG.packageSpacing;
            maxRowHeight = 0;
        }

        // Create package platform
        const packageObj = {
            name: pkg.name,
            x: packageX,
            y: packageY,
            width: pkgLayout.width,
            height: pkgLayout.height,
            depth: pkgLayout.depth,
            z: 0,
            buildings: []
        };

        // Create buildings for this package
        pkgLayout.positions.forEach(pos => {
            const buildingHeight = Math.max(
                CONFIG.minBuildingHeight,
                pos.class.linesOfCode * CONFIG.locToHeightScale
            );

            // Calculate footprint based on LOC for visual variety
            const footprint = calculateBuildingFootprint(pos.class.linesOfCode);

            const building = {
                className: pos.class.name,
                packageName: pkg.name,
                linesOfCode: pos.class.linesOfCode,
                gitMetadata: pos.class.gitMetadata,
                x: packageX + pos.x,
                y: packageY + pos.y,
                z: 5, // Buildings sit on top of platform
                width: footprint.width,
                depth: footprint.depth,
                height: buildingHeight,
                color: CONFIG.buildingBaseColor
            };

            buildings.push(building);
            packageObj.buildings.push(building);
        });

        packages.push(packageObj);

        packageX += pkgLayout.width + CONFIG.packageSpacing;
        maxRowHeight = Math.max(maxRowHeight, pkgLayout.depth);
    });
}

// Process data and create building/package objects
function processData(data) {
    buildings = [];
    packages = [];

    // Sort packages by total LOC (largest first) for downtown/suburb effect
    const packagesWithMass = data.packages.map(pkg => ({
        pkg: pkg,
        mass: calculatePackageMass(pkg)
    })).sort((a, b) => b.mass - a.mass);

    // Choose layout strategy
    if (CONFIG.layoutStrategy === 'grid') {
        layoutPackagesGrid(packagesWithMass);
    } else {
        layoutPackagesQuadrant(packagesWithMass);
    }

    // Calculate git normalization values if git data is present
    calculateGitNormalization(data);

    // Show git controls if git data is available
    showGitControlsIfNeeded();

    // Calculate bounds and auto-scale/center
    calculateViewTransform();
}

// Calculate normalization values for git metadata
function calculateGitNormalization(data) {
    let maxCommits = 0;
    let maxAuthors = 0;
    let oldestDate = Infinity;
    let newestDate = 0;
    let hasGitData = false;

    data.packages.forEach(pkg => {
        pkg.classes.forEach(cls => {
            if (cls.gitMetadata) {
                hasGitData = true;

                if (cls.gitMetadata.commits !== undefined) {
                    maxCommits = Math.max(maxCommits, cls.gitMetadata.commits);
                }

                if (cls.gitMetadata.authors !== undefined) {
                    maxAuthors = Math.max(maxAuthors, cls.gitMetadata.authors);
                }

                if (cls.gitMetadata.lastModified) {
                    const date = new Date(cls.gitMetadata.lastModified).getTime();
                    oldestDate = Math.min(oldestDate, date);
                    newestDate = Math.max(newestDate, date);
                }
            }
        });
    });

    if (hasGitData) {
        CONFIG.gitNormalization = {
            maxCommits: maxCommits || 1,
            maxAuthors: maxAuthors || 1,
            oldestDate: oldestDate === Infinity ? Date.now() : oldestDate,
            newestDate: newestDate || Date.now()
        };

        // Create git color manager
        gitColorManager = new GitMetadataColorManager(
            CONFIG.gitNormalization.maxCommits,
            CONFIG.gitNormalization.maxAuthors,
            CONFIG.gitNormalization.oldestDate,
            CONFIG.gitNormalization.newestDate
        );
    }
}

// Calculate view transform to center and scale the city
function calculateViewTransform() {
    if (buildings.length === 0 && packages.length === 0) return;

    console.log('calculateViewTransform: Starting calculation');

    // Find bounding box of entire city in 3D space
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    // Check all packages
    packages.forEach(pkg => {
        minX = Math.min(minX, pkg.x);
        maxX = Math.max(maxX, pkg.x + pkg.width);
        minY = Math.min(minY, pkg.y);
        maxY = Math.max(maxY, pkg.y + pkg.depth);
        minZ = Math.min(minZ, pkg.z);
        maxZ = Math.max(maxZ, pkg.z + pkg.height);
    });

    // Check all buildings
    buildings.forEach(building => {
        minX = Math.min(minX, building.x);
        maxX = Math.max(maxX, building.x + building.width);
        minY = Math.min(minY, building.y);
        maxY = Math.max(maxY, building.y + building.depth);
        minZ = Math.min(minZ, building.z);
        maxZ = Math.max(maxZ, building.z + building.height);
    });

    // Calculate center in 3D space
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Project bounding box corners to isometric space WITHOUT scale/offset
    // (We need raw isometric coordinates to calculate proper scale)
    const toIsoRaw = (x, y, z) => ({
        x: (x - y) * Math.cos(CONFIG.isoAngle),
        y: (x + y) * Math.sin(CONFIG.isoAngle) - z
    });

    const corners = [
        toIsoRaw(minX, minY, minZ),
        toIsoRaw(maxX, minY, minZ),
        toIsoRaw(maxX, maxY, minZ),
        toIsoRaw(minX, maxY, minZ),
        toIsoRaw(minX, minY, maxZ),
        toIsoRaw(maxX, minY, maxZ),
        toIsoRaw(maxX, maxY, maxZ),
        toIsoRaw(minX, maxY, maxZ)
    ];

    let screenMinX = Infinity, screenMaxX = -Infinity;
    let screenMinY = Infinity, screenMaxY = -Infinity;

    corners.forEach(corner => {
        screenMinX = Math.min(screenMinX, corner.x);
        screenMaxX = Math.max(screenMaxX, corner.x);
        screenMinY = Math.min(screenMinY, corner.y);
        screenMaxY = Math.max(screenMaxY, corner.y);
    });

    const screenWidth = screenMaxX - screenMinX;
    const screenHeight = screenMaxY - screenMinY;

    // Calculate scale to fit in canvas with padding
    const padding = 50;
    const availableWidth = canvas.width - padding * 2;
    const availableHeight = canvas.height - padding * 2;

    const scaleX = availableWidth / screenWidth;
    const scaleY = availableHeight / screenHeight;
    const newScale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x for readability

    CONFIG.scale = newScale;

    // Recalculate screen bounds with new scale (scale around origin)
    const scaledCorners = corners.map(c => ({
        x: c.x * newScale,
        y: c.y * newScale
    }));

    screenMinX = Math.min(...scaledCorners.map(c => c.x));
    screenMaxX = Math.max(...scaledCorners.map(c => c.x));
    screenMinY = Math.min(...scaledCorners.map(c => c.y));
    screenMaxY = Math.max(...scaledCorners.map(c => c.y));

    // Calculate offsets to center
    const screenCenterX = (screenMinX + screenMaxX) / 2;
    const screenCenterY = (screenMinY + screenMaxY) / 2;

    const canvasCenterX = canvas.width / 2;
    const canvasCenterY = canvas.height / 2;

    CONFIG.offsetX = (canvasCenterX - screenCenterX);
    CONFIG.offsetY = (canvasCenterY - screenCenterY);

    console.log('calculateViewTransform: Results', {
        bounds3D: { minX, maxX, minY, maxY, minZ, maxZ },
        screenBounds: { screenMinX, screenMaxX, screenMinY, screenMaxY },
        scale: CONFIG.scale,
        offset: { x: CONFIG.offsetX, y: CONFIG.offsetY },
        canvas: { width: canvas.width, height: canvas.height }
    });
}

// Calculate layout for buildings within a package
function calculatePackageLayout(pkg) {
    const sortedClasses = [...pkg.classes].sort((a, b) => b.linesOfCode - a.linesOfCode);

    const maxBuildingsPerRow = Math.min(6, Math.ceil(Math.sqrt(pkg.classes.length)));

    const positions = [];
    let currentX = CONFIG.packagePadding;
    let currentY = CONFIG.packagePadding;
    let rowHeight = 0;
    let maxWidth = 0;
    let totalDepth = CONFIG.packagePadding;

    sortedClasses.forEach((cls, index) => {
        // Calculate this building's footprint for layout
        const footprint = calculateBuildingFootprint(cls.linesOfCode);

        if (index > 0 && index % maxBuildingsPerRow === 0) {
            currentX = CONFIG.packagePadding;
            currentY += rowHeight + CONFIG.buildingSpacing;
            rowHeight = 0;
        }

        positions.push({
            x: currentX,
            y: currentY,
            class: cls
        });

        // Update tracking variables with actual building dimensions
        const buildingEndX = currentX + footprint.width;
        const buildingEndY = currentY + footprint.depth;

        currentX += footprint.width + CONFIG.buildingSpacing;
        rowHeight = Math.max(rowHeight, footprint.depth);
        maxWidth = Math.max(maxWidth, buildingEndX);
        totalDepth = Math.max(totalDepth, buildingEndY);
    });

    return {
        width: maxWidth + CONFIG.packagePadding,
        height: 5, // Platform height
        depth: totalDepth + CONFIG.packagePadding,
        positions: positions
    };
}

// Main render function
function renderCity() {
    if (!projectData) return;

    // Clear canvas
    ctx.fillStyle = CONFIG.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sort all objects by depth for proper z-ordering (back to front)
    const allObjects = [
        ...packages.map(p => ({type: 'package', obj: p})),
        ...buildings.map(b => ({type: 'building', obj: b}))
    ];

    allObjects.sort((a, b) => {
        const depthA = a.obj.y + a.obj.x;
        const depthB = b.obj.y + b.obj.x;
        return depthA - depthB;
    });

    // Render all objects in order
    allObjects.forEach(item => {
        if (item.type === 'package') {
            drawPackagePlatform(item.obj);
        } else {
            drawBuilding(item.obj);
        }
    });
}

// Draw a package platform (rectangular base)
function drawPackagePlatform(pkg) {
    // Save canvas state to prevent state bleeding
    ctx.save();

    const corners = [
        toIsometric(pkg.x, pkg.y, pkg.z),
        toIsometric(pkg.x + pkg.width, pkg.y, pkg.z),
        toIsometric(pkg.x + pkg.width, pkg.y + pkg.depth, pkg.z),
        toIsometric(pkg.x, pkg.y + pkg.depth, pkg.z),
        toIsometric(pkg.x, pkg.y, pkg.z + pkg.height),
        toIsometric(pkg.x + pkg.width, pkg.y, pkg.z + pkg.height),
        toIsometric(pkg.x + pkg.width, pkg.y + pkg.depth, pkg.z + pkg.height),
        toIsometric(pkg.x, pkg.y + pkg.depth, pkg.z + pkg.height)
    ];

    // Draw top face
    ctx.beginPath();
    ctx.moveTo(corners[4].x, corners[4].y);
    ctx.lineTo(corners[5].x, corners[5].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[7].x, corners[7].y);
    ctx.closePath();
    ctx.fillStyle = CONFIG.packageHighlight;
    ctx.fill();
    ctx.strokeStyle = CONFIG.packageColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw right face
    ctx.beginPath();
    ctx.moveTo(corners[5].x, corners[5].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.closePath();
    ctx.fillStyle = darken(CONFIG.packageColor, 0.8);
    ctx.fill();
    ctx.strokeStyle = CONFIG.packageColor;
    ctx.stroke();

    // Draw left face
    ctx.beginPath();
    ctx.moveTo(corners[7].x, corners[7].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.fillStyle = darken(CONFIG.packageColor, 0.6);
    ctx.fill();
    ctx.strokeStyle = CONFIG.packageColor;
    ctx.stroke();

    // Restore canvas state
    ctx.restore();
}

// Check if a class is deprecated
function isDeprecated(className) {
    const deprecatedKeywords = ['Deprecated', 'Legacy', 'Obsolete', 'Old'];
    return deprecatedKeywords.some(keyword => className.includes(keyword));
}

// Draw a building (isometric box)
function drawBuilding(building) {
    // Save canvas state to prevent state bleeding between buildings
    ctx.save();

    const isHovered = hoveredBuilding === building;
    const isSelected = selectedBuilding === building;
    const deprecated = isDeprecated(building.className);

    // Determine colors based on git metadata or defaults
    let baseColor = building.color;
    let shades = null;

    if (isSelected) {
        baseColor = CONFIG.buildingSelectedColor;
    } else if (isHovered) {
        baseColor = CONFIG.buildingHighlightColor;
    } else if (building.gitMetadata && gitColorManager && CONFIG.showGitData) {
        // Use git metadata for coloring
        const colorData = gitColorManager.getColorForBuilding(
            building.gitMetadata,
            {
                useFrequency: CONFIG.gitVisualization.showFrequency,
                useAge: CONFIG.gitVisualization.showAge,
                colorBlindMode: CONFIG.colorBlindMode
            }
        );
        shades = gitColorManager.getShades(colorData);
    }

    const x = building.x;
    const y = building.y;
    const z = building.z;
    const w = building.width;
    const d = building.depth;
    const h = building.height;

    // Calculate 8 corners of the box
    const corners = [
        toIsometric(x, y, z),
        toIsometric(x + w, y, z),
        toIsometric(x + w, y + d, z),
        toIsometric(x, y + d, z),
        toIsometric(x, y, z + h),
        toIsometric(x + w, y, z + h),
        toIsometric(x + w, y + d, z + h),
        toIsometric(x, y + d, z + h)
    ];

    // Add glow for recent changes
    if (building.gitMetadata && gitColorManager && CONFIG.gitVisualization.showRecentGlow) {
        if (gitColorManager.isRecent(building.gitMetadata, 7)) {
            ctx.shadowColor = '#f39c12';
            ctx.shadowBlur = 15;
        }
    }

    // Set line style for deprecated classes
    if (deprecated) {
        ctx.setLineDash([5, 5]); // Dashed line: 5px dash, 5px gap
    } else {
        ctx.setLineDash([]); // Solid line
    }

    // Draw three visible faces

    // Top face (brightest)
    ctx.beginPath();
    ctx.moveTo(corners[4].x, corners[4].y);
    ctx.lineTo(corners[5].x, corners[5].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[7].x, corners[7].y);
    ctx.closePath();
    ctx.fillStyle = shades ? shades.top : lighten(baseColor, 1.2);
    ctx.fill();
    ctx.strokeStyle = shades ? darken(shades.top, 0.7) : darken(baseColor, 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Right face (medium)
    ctx.beginPath();
    ctx.moveTo(corners[5].x, corners[5].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.closePath();
    ctx.fillStyle = shades ? shades.right : baseColor;
    ctx.fill();
    ctx.strokeStyle = shades ? darken(shades.right, 0.7) : darken(baseColor, 0.7);
    ctx.stroke();

    // Left face (darkest)
    ctx.beginPath();
    ctx.moveTo(corners[7].x, corners[7].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.fillStyle = shades ? shades.left : darken(baseColor, 0.7);
    ctx.fill();
    ctx.strokeStyle = shades ? darken(shades.left, 0.5) : darken(baseColor, 0.5);
    ctx.stroke();

    // Store screen coordinates for hit testing
    building.screenBounds = {
        minX: Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x, corners[4].x, corners[5].x, corners[6].x, corners[7].x),
        maxX: Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x, corners[4].x, corners[5].x, corners[6].x, corners[7].x),
        minY: Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y, corners[4].y, corners[5].y, corners[6].y, corners[7].y),
        maxY: Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y, corners[4].y, corners[5].y, corners[6].y, corners[7].y)
    };

    // Restore canvas state to prevent state bleeding to other buildings
    ctx.restore();
}

// Color utility functions
function lighten(color, factor) {
    const hex = color.replace('#', '');
    const r = Math.min(255, parseInt(hex.substr(0, 2), 16) * factor);
    const g = Math.min(255, parseInt(hex.substr(2, 2), 16) * factor);
    const b = Math.min(255, parseInt(hex.substr(4, 2), 16) * factor);
    return `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
}

function darken(color, factor) {
    return lighten(color, factor);
}

// Mouse interaction
function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Handle panning if middle mouse button is held
    if (isPanning) {
        const deltaX = mouseX - panStartX;
        const deltaY = mouseY - panStartY;

        CONFIG.offsetX = panOffsetX + deltaX;
        CONFIG.offsetY = panOffsetY + deltaY;

        renderCity();
        return;
    }

    let foundHovered = null;
    let maxDepth = -Infinity;

    // Check all buildings and find the frontmost one under the mouse
    for (let i = 0; i < buildings.length; i++) {
        const building = buildings[i];
        if (building.screenBounds &&
            mouseX >= building.screenBounds.minX &&
            mouseX <= building.screenBounds.maxX &&
            mouseY >= building.screenBounds.minY &&
            mouseY <= building.screenBounds.maxY) {

            // Calculate depth (higher value = closer to viewer in isometric)
            const depth = building.y + building.x;

            // Pick the building closest to the viewer
            if (depth > maxDepth) {
                maxDepth = depth;
                foundHovered = building;
            }
        }
    }

    if (foundHovered !== hoveredBuilding) {
        hoveredBuilding = foundHovered;
        renderCity();

        if (hoveredBuilding) {
            showBuildingInfo(hoveredBuilding);
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
    }
}

function handleClick(event) {
    if (hoveredBuilding) {
        selectedBuilding = hoveredBuilding;
        renderCity();
        showBuildingInfo(hoveredBuilding);
    }
}

// Handle mouse wheel for zooming
function handleWheel(event) {
    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate zoom factor
    const zoomIntensity = 0.1;
    const wheel = event.deltaY < 0 ? 1 : -1;
    const zoom = Math.exp(wheel * zoomIntensity);

    // Calculate mouse position in world space before zoom
    const worldX = (mouseX - CONFIG.offsetX) / CONFIG.scale;
    const worldY = (mouseY - CONFIG.offsetY) / CONFIG.scale;

    // Update scale
    const newScale = CONFIG.scale * zoom;

    // Clamp scale to reasonable bounds
    CONFIG.scale = Math.max(0.1, Math.min(5, newScale));

    // Adjust offset to keep mouse position fixed
    CONFIG.offsetX = mouseX - worldX * CONFIG.scale;
    CONFIG.offsetY = mouseY - worldY * CONFIG.scale;

    renderCity();
}

// Handle mouse down for panning
function handleMouseDown(event) {
    // Middle mouse button (button === 1)
    if (event.button === 1) {
        event.preventDefault();
        isPanning = true;

        const rect = canvas.getBoundingClientRect();
        panStartX = event.clientX - rect.left;
        panStartY = event.clientY - rect.top;
        panOffsetX = CONFIG.offsetX;
        panOffsetY = CONFIG.offsetY;

        canvas.style.cursor = 'grab';
    }
}

// Handle mouse up to stop panning
function handleMouseUp(event) {
    if (event.button === 1) {
        isPanning = false;
        canvas.style.cursor = 'default';
    }
}

// Handle mouse leaving canvas to stop panning
function handleMouseLeave(event) {
    if (isPanning) {
        isPanning = false;
        canvas.style.cursor = 'default';
    }
}

// Show building information
function showBuildingInfo(building) {
    const details = document.getElementById('details');

    let gitInfo = '';
    if (building.gitMetadata && gitColorManager) {
        const git = building.gitMetadata;
        gitInfo = `
            <div class="git-info-section">
                <h4 style="color: #3498db; margin-top: 15px; margin-bottom: 10px;">Git Metadata</h4>
                <div class="info-item">
                    <div class="info-label">Commits</div>
                    <div class="info-value">${git.commits || 0} (${gitColorManager.getFrequencyLabel(git.commits || 0)})</div>
                </div>
                ${git.authors !== undefined ? `
                <div class="info-item">
                    <div class="info-label">Authors</div>
                    <div class="info-value">${git.authors}</div>
                </div>
                ` : ''}
                ${git.lastModified ? `
                <div class="info-item">
                    <div class="info-label">Last Modified</div>
                    <div class="info-value">${gitColorManager.formatDate(git.lastModified)}</div>
                </div>
                ` : ''}
            </div>
        `;
    }

    const deprecatedBadge = isDeprecated(building.className)
        ? '<span style="color: #e74c3c; font-size: 12px; margin-left: 10px;">⚠ DEPRECATED</span>'
        : '';

    details.innerHTML = `
        <h3>${building.className}${deprecatedBadge}</h3>
        <div class="info-item">
            <div class="info-label">Package</div>
            <div class="info-value">${building.packageName}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Lines of Code</div>
            <div class="info-value">${building.linesOfCode}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Building Height</div>
            <div class="info-value">${Math.floor(building.height)}px</div>
        </div>
        ${gitInfo}
    `;
}

// Display project statistics (same as original visualizer)
function displayProjectStats(data) {
    const stats = document.getElementById('project-stats');

    const totalPackages = data.packages.length;
    const totalClasses = data.packages.reduce((sum, pkg) => sum + pkg.classes.length, 0);
    const totalLoc = data.packages.reduce((sum, pkg) =>
        sum + pkg.classes.reduce((s, cls) => s + cls.linesOfCode, 0), 0
    );
    const avgLocPerClass = Math.round(totalLoc / totalClasses);

    let largestClass = null;
    let smallestClass = null;
    let largestLoc = 0;
    let smallestLoc = Infinity;

    data.packages.forEach(pkg => {
        pkg.classes.forEach(cls => {
            if (cls.linesOfCode > largestLoc) {
                largestLoc = cls.linesOfCode;
                largestClass = cls.name;
            }
            if (cls.linesOfCode < smallestLoc) {
                smallestLoc = cls.linesOfCode;
                smallestClass = cls.name;
            }
        });
    });

    stats.innerHTML = `
        <div class="stat-item">
            <span class="stat-label">Total Packages</span>
            <span class="stat-value">${totalPackages}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Classes</span>
            <span class="stat-value">${totalClasses}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Lines of Code</span>
            <span class="stat-value">${totalLoc.toLocaleString()}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Average LOC/Class</span>
            <span class="stat-value">${avgLocPerClass}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Largest Class</span>
            <span class="stat-value">${largestClass} (${largestLoc})</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Smallest Class</span>
            <span class="stat-value">${smallestClass} (${smallestLoc})</span>
        </div>
    `;
}

// Setup git visualization controls
function setupGitControls() {
    const toggleFrequency = document.getElementById('toggle-frequency');
    const toggleAge = document.getElementById('toggle-age');
    const toggleGlow = document.getElementById('toggle-glow');
    const colorBlindMode = document.getElementById('colorblind-mode');

    if (toggleFrequency) {
        toggleFrequency.addEventListener('change', (e) => {
            CONFIG.gitVisualization.showFrequency = e.target.checked;
            renderCity();
        });
    }

    if (toggleAge) {
        toggleAge.addEventListener('change', (e) => {
            CONFIG.gitVisualization.showAge = e.target.checked;
            renderCity();
        });
    }

    if (toggleGlow) {
        toggleGlow.addEventListener('change', (e) => {
            CONFIG.gitVisualization.showRecentGlow = e.target.checked;
            renderCity();
        });
    }

    if (colorBlindMode) {
        colorBlindMode.addEventListener('change', (e) => {
            CONFIG.colorBlindMode = e.target.checked;
            renderCity();
        });
    }
}

// Show git controls and legend if git data is present
function showGitControlsIfNeeded() {
    const gitControls = document.getElementById('git-controls');
    const gitLegend = document.getElementById('git-legend');

    if (gitColorManager) {
        if (gitControls) gitControls.style.display = 'block';
        if (gitLegend) gitLegend.style.display = 'block';
    }
}

// Setup layout strategy controls
function setupLayoutControls() {
    const layoutRadios = document.querySelectorAll('input[name="layout"]');

    layoutRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            CONFIG.layoutStrategy = e.target.value;
            // Reload the data to apply new layout (processData calls calculateViewTransform)
            if (projectData) {
                processData(projectData);
                renderCity();
            }
        });
    });
}
