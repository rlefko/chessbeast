/**
 * Tool Handlers for Agentic Variation Explorer
 *
 * This module exports the tool handler infrastructure and specialized handlers
 * that decompose the monolithic executeTreeTool method following SRP.
 */

// Infrastructure
export { ToolRouter, type ToolHandler, type ToolExecutionContext } from './tool-router.js';

// Handlers
export { AnalysisToolHandler } from './analysis-handler.js';
export { AnnotationToolHandler, validateAndCleanComment } from './annotation-handler.js';
export { NavigationToolHandler } from './navigation-handler.js';
export { WorkQueueToolHandler } from './work-queue-handler.js';
export {
  StoppingToolHandler,
  type MarkedSubPosition,
  type StoppingToolContext,
} from './stopping-handler.js';
