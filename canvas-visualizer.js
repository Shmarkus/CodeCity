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

    // Setup git controls
    setupGitControls();

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

// Process data and create building/package objects
function processData(data) {
    buildings = [];
    packages = [];

    // Sort packages by total LOC (largest first) for downtown/suburb effect
    const packagesWithMass = data.packages.map(pkg => ({
        pkg: pkg,
        mass: calculatePackageMass(pkg)
    })).sort((a, b) => b.mass - a.mass);

    // Divide into quartiles for quadrant placement
    const quartileSize = Math.ceil(packagesWithMass.length / 4);
    const q1 = packagesWithMass.slice(0, quartileSize);                          // Largest (center)
    const q2 = packagesWithMass.slice(quartileSize, quartileSize * 2);           // Large (right)
    const q3 = packagesWithMass.slice(quartileSize * 2, quartileSize * 3);       // Medium (bottom)
    const q4 = packagesWithMass.slice(quartileSize * 3);                         // Smallest (left)

    // Layout each quadrant
    const quadrants = [
        { packages: q1, startX: 500, startY: 500 },   // Center-ish (downtown)
        { packages: q2, startX: 1500, startY: 0 },    // Right
        { packages: q3, startX: 500, startY: 1500 },  // Bottom
        { packages: q4, startX: 0, startY: 0 }        // Left
    ];

    quadrants.forEach(quadrant => {
        let packageX = quadrant.startX;
        let packageY = quadrant.startY;
        let maxRowHeight = 0;
        const maxRowWidth = 1000;

        quadrant.packages.forEach((pkgWithMass, idx) => {
            const pkg = pkgWithMass.pkg;
            const pkgLayout = calculatePackageLayout(pkg);

            // Check if we need to wrap to next row within quadrant
            if (idx > 0 && packageX - quadrant.startX + pkgLayout.width > maxRowWidth) {
                packageX = quadrant.startX;
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

                const building = {
                    className: pos.class.name,
                    packageName: pkg.name,
                    linesOfCode: pos.class.linesOfCode,
                    gitMetadata: pos.class.gitMetadata, // Include git metadata
                    x: packageX + pos.x,
                    y: packageY + pos.y,
                    z: 5, // Buildings sit on top of platform
                    width: CONFIG.buildingWidth,
                    depth: CONFIG.buildingDepth,
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
    });

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

    // Project bounding box corners to screen space to find screen bounds
    const corners = [
        toIsometric(minX, minY, minZ),
        toIsometric(maxX, minY, minZ),
        toIsometric(maxX, maxY, minZ),
        toIsometric(minX, maxY, minZ),
        toIsometric(minX, minY, maxZ),
        toIsometric(maxX, minY, maxZ),
        toIsometric(maxX, maxY, maxZ),
        toIsometric(minX, maxY, maxZ)
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

    // Recalculate screen bounds with new scale
    const scaledCorners = corners.map(c => ({
        x: (c.x - CONFIG.offsetX) * newScale + CONFIG.offsetX,
        y: (c.y - CONFIG.offsetY) * newScale + CONFIG.offsetY
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

    CONFIG.offsetX += (canvasCenterX - screenCenterX);
    CONFIG.offsetY += (canvasCenterY - screenCenterY);
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

        currentX += CONFIG.buildingWidth + CONFIG.buildingSpacing;
        rowHeight = Math.max(rowHeight, CONFIG.buildingDepth);
        maxWidth = Math.max(maxWidth, currentX);
        totalDepth = Math.max(totalDepth, currentY + CONFIG.buildingDepth);
    });

    return {
        width: Math.max(maxWidth + CONFIG.packagePadding, 180),
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
}

// Check if a class is deprecated
function isDeprecated(className) {
    const deprecatedKeywords = ['Deprecated', 'Legacy', 'Obsolete', 'Old'];
    return deprecatedKeywords.some(keyword => className.includes(keyword));
}

// Draw a building (isometric box)
function drawBuilding(building) {
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

    // Reset shadow and line dash
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    // Store screen coordinates for hit testing
    building.screenBounds = {
        minX: Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x, corners[4].x, corners[5].x, corners[6].x, corners[7].x),
        maxX: Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x, corners[4].x, corners[5].x, corners[6].x, corners[7].x),
        minY: Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y, corners[4].y, corners[5].y, corners[6].y, corners[7].y),
        maxY: Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y, corners[4].y, corners[5].y, corners[6].y, corners[7].y)
    };
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

    let foundHovered = null;

    // Check buildings in reverse order (front to back)
    for (let i = buildings.length - 1; i >= 0; i--) {
        const building = buildings[i];
        if (building.screenBounds &&
            mouseX >= building.screenBounds.minX &&
            mouseX <= building.screenBounds.maxX &&
            mouseY >= building.screenBounds.minY &&
            mouseY <= building.screenBounds.maxY) {
            foundHovered = building;
            break;
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
