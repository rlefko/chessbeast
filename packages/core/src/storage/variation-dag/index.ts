/**
 * Variation DAG module exports
 *
 * DAG-based variation tree with full transposition support.
 */

// Node types and utilities
export {
  type NodeId,
  type EdgeId,
  type NodeSource,
  type NodeMetadata,
  type DecisionRef,
  type VariationNode,
  createVariationNode,
  visitNode,
  addArtifactRef,
  getArtifactRef,
  addDecisionRef,
  markInteresting,
  clearInteresting,
  isRootNode,
  isLeafNode,
  isTransposition,
  generateNodeId,
  resetNodeIdCounter,
} from './node.js';

// Edge types and utilities
export {
  type EdgeSource,
  type EdgeMetadata,
  type VariationEdge,
  createVariationEdge,
  setEdgeComment,
  addEdgeNag,
  removeEdgeNag,
  setEdgeNags,
  clearEdgeNags,
  setMoveAssessmentRef,
  setPrincipal,
  generateEdgeId,
  resetEdgeIdCounter,
  getNagString,
  hasAnnotations,
  getEdgeDisplayString,
} from './edge.js';

// DAG manager
export {
  type AddMoveResult,
  type NavigationResult,
  type DagPath,
  VariationDAG,
  createVariationDAG,
} from './dag-manager.js';
