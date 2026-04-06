// Register the Component Cop DevTools panel
// WXT flattens entrypoints/panel/index.html → panel.html in the output
chrome.devtools.panels.create(
  'Component Cop',
  '', // icon path (empty = default)
  'panel.html',
);
