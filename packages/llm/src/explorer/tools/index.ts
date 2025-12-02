/**
 * Tool Handlers for Agentic Variation Explorer
 *
 * This module exports the tool handler infrastructure and specialized handlers
 * that decompose the monolithic executeTreeTool method following SRP.
 */

// Infrastructure
export { ToolRouter, type ToolHandler, type ToolExecutionContext } from './tool-router.js';

// Handlers
export { AnnotationToolHandler, validateAndCleanComment } from './annotation-handler.js';
export { WorkQueueToolHandler } from './work-queue-handler.js';
export {
  StoppingToolHandler,
  type MarkedSubPosition,
  type StoppingToolContext,
} from './stopping-handler.js';
