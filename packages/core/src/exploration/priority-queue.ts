/**
 * Priority Queue
 *
 * A generic max-heap priority queue implementation.
 * Items with higher priority (as determined by the compare function) are dequeued first.
 *
 * Time complexities:
 * - push: O(log n)
 * - pop: O(log n)
 * - peek: O(1)
 * - updatePriority: O(n) in worst case
 * - remove: O(n)
 */

/**
 * Generic priority queue using a binary heap
 *
 * @typeParam T - Type of items in the queue
 */
export class PriorityQueue<T> {
  private heap: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  /**
   * Create a new priority queue
   *
   * @param compareFn - Comparison function. Should return:
   *   - positive if a has higher priority than b
   *   - negative if a has lower priority than b
   *   - zero if equal priority
   */
  constructor(compareFn: (a: T, b: T) => number) {
    this.compare = compareFn;
  }

  /**
   * Number of items in the queue
   */
  get size(): number {
    return this.heap.length;
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Add an item to the queue
   *
   * @param item - Item to add
   */
  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Remove and return the highest priority item
   *
   * @returns The highest priority item, or undefined if empty
   */
  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;

    const top = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return top;
  }

  /**
   * Return the highest priority item without removing it
   *
   * @returns The highest priority item, or undefined if empty
   */
  peek(): T | undefined {
    return this.heap[0];
  }

  /**
   * Update an item's priority by applying a transform function
   *
   * @param item - The item to update (matched by reference)
   * @param transform - Function to create the updated item
   * @returns true if item was found and updated
   */
  updatePriority(item: T, transform: (old: T) => T): boolean {
    const index = this.heap.indexOf(item);
    if (index === -1) return false;

    const newItem = transform(item);
    this.heap[index] = newItem;

    // Re-heapify - bubble in both directions
    this.bubbleUp(index);
    this.bubbleDown(index);

    return true;
  }

  /**
   * Update an item's priority using a predicate to find it
   *
   * @param predicate - Function to find the item
   * @param transform - Function to create the updated item
   * @returns true if item was found and updated
   */
  updateWhere(predicate: (item: T) => boolean, transform: (old: T) => T): boolean {
    const index = this.heap.findIndex(predicate);
    if (index === -1) return false;

    const newItem = transform(this.heap[index]!);
    this.heap[index] = newItem;

    this.bubbleUp(index);
    this.bubbleDown(index);

    return true;
  }

  /**
   * Remove an item from the queue
   *
   * @param predicate - Function to identify the item to remove
   * @returns true if item was found and removed
   */
  remove(predicate: (item: T) => boolean): boolean {
    const index = this.heap.findIndex(predicate);
    if (index === -1) return false;

    const last = this.heap.pop();
    if (index < this.heap.length && last !== undefined) {
      this.heap[index] = last;
      this.bubbleUp(index);
      this.bubbleDown(index);
    }

    return true;
  }

  /**
   * Remove all items matching a predicate
   *
   * @param predicate - Function to identify items to remove
   * @returns Number of items removed
   */
  removeAll(predicate: (item: T) => boolean): number {
    const originalLength = this.heap.length;
    this.heap = this.heap.filter((item) => !predicate(item));

    // Rebuild heap
    if (this.heap.length > 0) {
      this.heapify();
    }

    return originalLength - this.heap.length;
  }

  /**
   * Check if an item exists in the queue
   *
   * @param predicate - Function to identify the item
   * @returns true if item exists
   */
  has(predicate: (item: T) => boolean): boolean {
    return this.heap.some(predicate);
  }

  /**
   * Find an item in the queue
   *
   * @param predicate - Function to identify the item
   * @returns The item if found, undefined otherwise
   */
  find(predicate: (item: T) => boolean): T | undefined {
    return this.heap.find(predicate);
  }

  /**
   * Get all items as an array (not in priority order)
   *
   * @returns Array of all items
   */
  toArray(): T[] {
    return [...this.heap];
  }

  /**
   * Get all items sorted by priority (highest first)
   *
   * @returns Sorted array of all items
   */
  toSortedArray(): T[] {
    return [...this.heap].sort((a, b) => this.compare(b, a));
  }

  /**
   * Clear all items from the queue
   */
  clear(): void {
    this.heap = [];
  }

  /**
   * Create a new queue from an array of items
   *
   * @param items - Items to add
   * @param compareFn - Comparison function
   * @returns New priority queue
   */
  static from<T>(items: T[], compareFn: (a: T, b: T) => number): PriorityQueue<T> {
    const queue = new PriorityQueue<T>(compareFn);
    queue.heap = [...items];
    queue.heapify();
    return queue;
  }

  /**
   * Bubble an item up to its correct position
   */
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex]!;
      const current = this.heap[index]!;

      if (this.compare(current, parent) <= 0) break;

      this.heap[parentIndex] = current;
      this.heap[index] = parent;
      index = parentIndex;
    }
  }

  /**
   * Bubble an item down to its correct position
   */
  private bubbleDown(index: number): void {
    const length = this.heap.length;

    for (;;) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let largestIndex = index;

      if (
        leftChildIndex < length &&
        this.compare(this.heap[leftChildIndex]!, this.heap[largestIndex]!) > 0
      ) {
        largestIndex = leftChildIndex;
      }

      if (
        rightChildIndex < length &&
        this.compare(this.heap[rightChildIndex]!, this.heap[largestIndex]!) > 0
      ) {
        largestIndex = rightChildIndex;
      }

      if (largestIndex === index) break;

      const temp = this.heap[index]!;
      this.heap[index] = this.heap[largestIndex]!;
      this.heap[largestIndex] = temp;
      index = largestIndex;
    }
  }

  /**
   * Build a heap from an unsorted array (Floyd's algorithm)
   */
  private heapify(): void {
    // Start from the last non-leaf node and bubble down
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.bubbleDown(i);
    }
  }
}

/**
 * Create a max priority queue for numbers
 */
export function createMaxNumberQueue(): PriorityQueue<number> {
  return new PriorityQueue<number>((a, b) => a - b);
}

/**
 * Create a min priority queue for numbers
 */
export function createMinNumberQueue(): PriorityQueue<number> {
  return new PriorityQueue<number>((a, b) => b - a);
}
