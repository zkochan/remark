'use strict'

module.exports = locateLink

/**
 * Find a possible link.
 *
 * @example
 *   locateLink('foo ![bar'); // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible link.
 */
function locateLink(value, fromIndex) {
    var link = value.indexOf('[', fromIndex);
    var image = value.indexOf('!' + '[', fromIndex);

    if (image === -1) {
        return link;
    }

    /*
     * Link can never be `-1` if an image is found, so we don’t need to
     * check for that :)
     */

    return link < image ? link : image;
}
