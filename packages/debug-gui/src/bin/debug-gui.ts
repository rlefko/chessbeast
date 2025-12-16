#!/usr/bin/env node
/**
 * Debug GUI Client CLI
 *
 * Standalone client that connects to a running debug server.
 *
 * Usage:
 *   chessbeast-debug-gui [ws-url]
 *   chessbeast-debug-gui ws://localhost:9222
 */

import React from 'react';
import { render } from 'ink';
import { App } from '../client/App.js';
import { DEFAULT_DEBUG_GUI_PORT } from '../server/websocket-server.js';

const args = process.argv.slice(2);
const url = args[0] || `ws://localhost:${DEFAULT_DEBUG_GUI_PORT}`;

// Validate URL format
if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
  console.error('Error: URL must start with ws:// or wss://');
  console.error('Usage: chessbeast-debug-gui [ws://host:port]');
  process.exit(1);
}

console.error(`Connecting to ${url}...`);

// Render the Ink app
const { waitUntilExit } = render(React.createElement(App, { url }));

waitUntilExit().then(() => {
  process.exit(0);
});
