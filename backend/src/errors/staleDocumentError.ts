export class StaleDocumentError extends Error {
  constructor() { super("Document was replaced or deleted while processing."); }
}
