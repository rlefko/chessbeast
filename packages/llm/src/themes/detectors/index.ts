/**
 * Theme Detectors
 *
 * All theme detector implementations and registry setup.
 */

// Tactical detectors
export { PinDetector, createPinDetector } from './pin-detector.js';
export { ForkDetector, createForkDetector } from './fork-detector.js';
export { SkewerDetector, createSkewerDetector } from './skewer-detector.js';
export { DiscoveryDetector, createDiscoveryDetector } from './discovery-detector.js';
export { BackRankDetector, createBackRankDetector } from './back-rank-detector.js';

// Structural detectors
export { PawnStructureDetector, createPawnStructureDetector } from './pawn-structure-detector.js';

// Positional detectors
export { PositionalDetector, createPositionalDetector } from './positional-detector.js';

// Dynamic detectors
export { DynamicDetector, createDynamicDetector } from './dynamic-detector.js';

import { createDetectorRegistry } from '../detector-interface.js';

import { createBackRankDetector } from './back-rank-detector.js';
import { createDiscoveryDetector } from './discovery-detector.js';
import { createDynamicDetector } from './dynamic-detector.js';
import { createForkDetector } from './fork-detector.js';
import { createPawnStructureDetector } from './pawn-structure-detector.js';
import { createPinDetector } from './pin-detector.js';
import { createPositionalDetector } from './positional-detector.js';
import { createSkewerDetector } from './skewer-detector.js';

/**
 * Create a registry with all built-in detectors
 */
export function createFullDetectorRegistry(): ReturnType<typeof createDetectorRegistry> {
  const registry = createDetectorRegistry();

  // Tactical detectors
  registry.register(createPinDetector());
  registry.register(createForkDetector());
  registry.register(createSkewerDetector());
  registry.register(createDiscoveryDetector());
  registry.register(createBackRankDetector());

  // Structural detectors
  registry.register(createPawnStructureDetector());

  // Positional detectors
  registry.register(createPositionalDetector());

  // Dynamic detectors
  registry.register(createDynamicDetector());

  return registry;
}

/**
 * Create a registry with only tactical detectors
 */
export function createTacticalDetectorRegistry(): ReturnType<typeof createDetectorRegistry> {
  const registry = createDetectorRegistry();

  registry.register(createPinDetector());
  registry.register(createForkDetector());
  registry.register(createSkewerDetector());
  registry.register(createDiscoveryDetector());
  registry.register(createBackRankDetector());

  return registry;
}

/**
 * Create a registry with only structural detectors
 */
export function createStructuralDetectorRegistry(): ReturnType<typeof createDetectorRegistry> {
  const registry = createDetectorRegistry();

  registry.register(createPawnStructureDetector());

  return registry;
}

/**
 * Create a registry with only positional detectors
 */
export function createPositionalDetectorRegistry(): ReturnType<typeof createDetectorRegistry> {
  const registry = createDetectorRegistry();

  registry.register(createPositionalDetector());

  return registry;
}

/**
 * Create a registry with only dynamic detectors
 */
export function createDynamicDetectorRegistry(): ReturnType<typeof createDetectorRegistry> {
  const registry = createDetectorRegistry();

  registry.register(createDynamicDetector());

  return registry;
}
