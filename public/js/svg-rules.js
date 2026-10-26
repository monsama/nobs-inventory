/* What an uploaded type icon may hold: shapes and their drawing attributes, nothing that runs, styles or links.
   The page cleans an upload down to these (sanitizeSvg in 04-settings.js); the server takes nothing else (state.js). */
export const SVG_ELEMENTS = ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'title', 'defs', 'desc'];
export const SVG_ATTRS = ['d', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'fill', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'transform', 'id', 'xmlns'];
