// Git Metadata Color Manager for Code City
// Converts git metrics (commits, age) into visual properties (color, saturation)

class GitMetadataColorManager {
    constructor(maxCommits, maxAuthors, oldestDate, newestDate) {
        this.maxCommits = maxCommits || 1;
        this.maxAuthors = maxAuthors || 1;
        this.oldestDate = oldestDate || Date.now();
        this.newestDate = newestDate || Date.now();
        this.dateRange = this.newestDate - this.oldestDate;
    }

    /**
     * Calculate color properties based on git metadata
     * @param {Object} gitMetadata - Git data for a file
     * @param {Object} options - Visualization options
     * @returns {Object} Color properties {hue, saturation, lightness}
     */
    getColorForBuilding(gitMetadata, options = {}) {
        const {
            useFrequency = true,
            useAge = true,
            colorBlindMode = false
        } = options;

        let hue = 200; // Default blue
        let saturation = 70; // Default saturation
        const lightness = 50; // Fixed lightness for base

        // Calculate hue based on commit frequency
        if (useFrequency && gitMetadata && gitMetadata.commits !== undefined) {
            const normalizedFrequency = Math.min(1, gitMetadata.commits / this.maxCommits);

            if (colorBlindMode) {
                // Purple (270°) to Orange (30°) - color-blind friendly
                hue = 270 - (normalizedFrequency * 240);
            } else {
                // Blue (240°) to Red (0°) - standard heat map
                hue = 240 - (normalizedFrequency * 240);
            }
        }

        // Calculate saturation based on file age
        if (useAge && gitMetadata && gitMetadata.lastModified) {
            const lastModifiedTime = new Date(gitMetadata.lastModified).getTime();
            const now = Date.now();
            const daysSinceChange = (now - lastModifiedTime) / (1000 * 60 * 60 * 24);

            // Fade over 365 days (1 year)
            const maxAgeDays = 365;
            const ageFactor = Math.max(0, Math.min(1, 1 - (daysSinceChange / maxAgeDays)));

            // Saturation: 20% (old/faded) to 70% (recent/vibrant)
            saturation = 20 + (ageFactor * 50);
        }

        return { hue, saturation, lightness };
    }

    /**
     * Generate three shades for isometric 3D rendering
     * @param {Object} baseColor - {hue, saturation, lightness}
     * @returns {Object} Three color strings for top, right, left faces
     */
    getShades(baseColor) {
        const { hue, saturation, lightness } = baseColor;

        return {
            top: `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`,      // Lighter (top face)
            right: `hsl(${hue}, ${saturation}%, ${lightness}%)`,         // Base (right face)
            left: `hsl(${hue}, ${saturation}%, ${lightness - 20}%)`      // Darker (left face)
        };
    }

    /**
     * Get a single color string for non-shaded use
     * @param {Object} baseColor - {hue, saturation, lightness}
     * @returns {string} HSL color string
     */
    getColorString(baseColor) {
        const { hue, saturation, lightness } = baseColor;
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    /**
     * Calculate if a file is "recent" (changed in last N days)
     * @param {Object} gitMetadata - Git metadata
     * @param {number} days - Number of days to consider "recent"
     * @returns {boolean}
     */
    isRecent(gitMetadata, days = 7) {
        if (!gitMetadata || !gitMetadata.lastModified) return false;

        const lastModifiedTime = new Date(gitMetadata.lastModified).getTime();
        const now = Date.now();
        const daysSinceChange = (now - lastModifiedTime) / (1000 * 60 * 60 * 24);

        return daysSinceChange <= days;
    }

    /**
     * Format date for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    formatDate(dateString) {
        if (!dateString) return 'Unknown';

        const date = new Date(dateString);
        const now = new Date();
        const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (daysDiff === 0) return 'Today';
        if (daysDiff === 1) return 'Yesterday';
        if (daysDiff < 7) return `${daysDiff} days ago`;
        if (daysDiff < 30) return `${Math.floor(daysDiff / 7)} weeks ago`;
        if (daysDiff < 365) return `${Math.floor(daysDiff / 30)} months ago`;

        return `${Math.floor(daysDiff / 365)} years ago`;
    }

    /**
     * Get a descriptive label for change frequency
     * @param {number} commits - Number of commits
     * @returns {string} Description
     */
    getFrequencyLabel(commits) {
        if (commits === 0) return 'No changes';
        if (commits === 1) return 'Single change';
        if (commits < 5) return 'Low activity';
        if (commits < 15) return 'Moderate activity';
        if (commits < 50) return 'High activity';
        return 'Very high activity';
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GitMetadataColorManager;
}
