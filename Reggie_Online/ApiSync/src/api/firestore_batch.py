"""
Firestore batch write utilities for efficient bulk operations.
Provides a batch writer that groups operations up to Firestore's 500 operation limit.
"""
import logging
from typing import Dict, Any, List, Optional
from google.cloud.firestore import AsyncClient, SERVER_TIMESTAMP

logger = logging.getLogger(__name__)

# Firestore batch limit: 500 operations per batch
MAX_BATCH_OPERATIONS = 500


class FirestoreBatchWriter:
    """
    Manages Firestore batch write operations.
    Groups operations and automatically splits into multiple batches when exceeding 500 operations.
    """
    
    def __init__(self, client: AsyncClient):
        """
        Initialize batch writer with an AsyncClient.
        
        Args:
            client: Firestore AsyncClient instance
        """
        self.client = client
        self.batch = client.batch()
        self.operation_count = 0
        self.batches = [self.batch]  # Track all batches created
        
    def add_update(self, doc_ref, data: Dict[str, Any]) -> bool:
        """
        Add an update operation to the current batch.
        
        Args:
            doc_ref: Document reference to update
            data: Dictionary of fields to update
        
        Returns:
            bool: True if operation was added, False if batch needs to be flushed first
        """
        if self.operation_count >= MAX_BATCH_OPERATIONS:
            # Create new batch
            self.batch = self.client.batch()
            self.batches.append(self.batch)
            self.operation_count = 0
        
        self.batch.update(doc_ref, data)
        self.operation_count += 1
        return True
    
    def add_set(self, doc_ref, data: Dict[str, Any], merge: bool = False) -> bool:
        """
        Add a set operation to the current batch.
        
        Args:
            doc_ref: Document reference to set
            data: Dictionary of data to set
            merge: If True, merge with existing document; if False, overwrite
        
        Returns:
            bool: True if operation was added, False if batch needs to be flushed first
        """
        if self.operation_count >= MAX_BATCH_OPERATIONS:
            # Create new batch
            self.batch = self.client.batch()
            self.batches.append(self.batch)
            self.operation_count = 0
        
        self.batch.set(doc_ref, data, merge=merge)
        self.operation_count += 1
        return True
    
    def add_delete(self, doc_ref) -> bool:
        """
        Add a delete operation to the current batch.
        
        Args:
            doc_ref: Document reference to delete
        
        Returns:
            bool: True if operation was added, False if batch needs to be flushed first
        """
        if self.operation_count >= MAX_BATCH_OPERATIONS:
            # Create new batch
            self.batch = self.client.batch()
            self.batches.append(self.batch)
            self.operation_count = 0
        
        self.batch.delete(doc_ref)
        self.operation_count += 1
        return True
    
    async def commit(self):
        """
        Commit all batches to Firestore.
        
        Returns:
            int: Total number of operations committed
        """
        if self.operation_count == 0:
            logger.debug("[FIRESTORE_BATCH] No operations to commit")
            return 0
        
        logger.info(
            f"[FIRESTORE_BATCH] Committing {len(self.batches)} batch(es) | "
            f"Total operations: {self.operation_count}"
        )
        
        # Commit all batches (they can run concurrently)
        for i, batch in enumerate(self.batches):
            await batch.commit()
            logger.debug(f"[FIRESTORE_BATCH] Batch {i+1}/{len(self.batches)} committed")
        
        logger.info(f"[FIRESTORE_BATCH] All batches committed successfully")
        return self.operation_count
    
    def reset(self):
        """
        Reset the batch writer to start a new batch sequence.
        """
        self.batch = self.client.batch()
        self.batches = [self.batch]
        self.operation_count = 0
        logger.debug("[FIRESTORE_BATCH] Batch writer reset")
    
    def get_operation_count(self) -> int:
        """
        Get the current number of operations in the batch.
        
        Returns:
            int: Number of operations in current batch
        """
        return self.operation_count

