/**
 * Annotation Module
 *
 * Post-write annotation pipeline for the Ultra-Fast Coach architecture.
 */

export type {
  PostWritePipelineConfig,
  PostWritePipelineProgress,
  PostWritePipelineInput,
  PostWritePipelineResult,
} from './post-write-pipeline.js';

export {
  PostWritePipeline,
  createPostWritePipeline,
  annotateWithPostWrite,
} from './post-write-pipeline.js';
