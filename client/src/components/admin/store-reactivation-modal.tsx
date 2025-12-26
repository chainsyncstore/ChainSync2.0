import { Store } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import type { Store as StoreRecord } from '@shared/schema';

interface StoreReactivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  storeLimit: number | null;
  inactiveStoreIds: string[];
}

export function StoreReactivationModal({
  isOpen,
  onClose,
  onSuccess,
  storeLimit,
  inactiveStoreIds,
}: StoreReactivationModalProps) {
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchStores = useCallback(async () => {
    setLoading(true);
    try {
      const allStores = await apiClient.get<StoreRecord[]>('/api/stores');
      // Filter to only inactive stores
      const inactiveStores = allStores.filter((store) =>
        inactiveStoreIds.includes(store.id)
      );
      setStores(inactiveStores);
    } catch (error) {
      console.error('Failed to fetch stores:', error);
      toast({
        title: 'Error',
        description: 'Failed to load stores. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [inactiveStoreIds, toast]);

  useEffect(() => {
    if (isOpen && inactiveStoreIds.length > 0) {
      void fetchStores();
    }
  }, [isOpen, inactiveStoreIds, fetchStores]);

  const handleToggleStore = (storeId: string) => {
    setSelectedStoreIds((prev) => {
      if (prev.includes(storeId)) {
        return prev.filter((id) => id !== storeId);
      }
      // Check limit if applicable
      if (storeLimit !== null) {
        // Get current active stores count from API or pass as prop
        // For now, we'll allow selection and validate on submit
        return [...prev, storeId];
      }
      return [...prev, storeId];
    });
  };

  const handleSelectAll = () => {
    if (selectedStoreIds.length === stores.length) {
      setSelectedStoreIds([]);
    } else {
      // Respect limit if applicable
      if (storeLimit !== null) {
        const maxSelectable = Math.min(storeLimit, stores.length);
        setSelectedStoreIds(stores.slice(0, maxSelectable).map((s) => s.id));
      } else {
        setSelectedStoreIds(stores.map((s) => s.id));
      }
    }
  };

  const handleSubmit = async () => {
    if (selectedStoreIds.length === 0) {
      toast({
        title: 'No stores selected',
        description: 'Please select at least one store to reactivate.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/stores/reactivate', {
        storeIds: selectedStoreIds,
      });

      toast({
        title: 'Stores reactivated',
        description: `Successfully reactivated ${selectedStoreIds.length} store(s).`,
      });

      setSelectedStoreIds([]);
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Failed to reactivate stores:', error);
      const errorMessage =
        error?.message ||
        error?.details?.message ||
        'Failed to reactivate stores. Please try again.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const maxSelectable =
    storeLimit !== null ? Math.min(storeLimit, stores.length) : stores.length;
  const canSelectAll = selectedStoreIds.length < maxSelectable;
  const allSelected = selectedStoreIds.length === stores.length && stores.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Reactivate Stores
          </DialogTitle>
          <DialogDescription>
            {storeLimit !== null
              ? `Select stores to reactivate. Your plan allows up to ${storeLimit} active store(s). You can select up to ${maxSelectable} store(s).`
              : 'Select stores to reactivate. There is no limit on the number of stores you can activate.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Loading stores...</p>
            </div>
          ) : stores.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                No inactive stores found.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all"
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    disabled={!canSelectAll && !allSelected}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Select All ({selectedStoreIds.length}/{maxSelectable})
                  </label>
                </div>
              </div>
              {stores.map((store) => {
                const isSelected = selectedStoreIds.includes(store.id);
                const isDisabled =
                  !isSelected &&
                  storeLimit !== null &&
                  selectedStoreIds.length >= maxSelectable;

                return (
                  <div
                    key={store.id}
                    className={`flex items-center space-x-3 rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? 'bg-primary/5 border-primary'
                        : isDisabled
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-accent'
                    }`}
                  >
                    <Checkbox
                      id={store.id}
                      checked={isSelected}
                      onCheckedChange={() => handleToggleStore(store.id)}
                      disabled={isDisabled}
                    />
                    <label
                      htmlFor={store.id}
                      className={`flex-1 cursor-pointer ${
                        isDisabled ? 'cursor-not-allowed' : ''
                      }`}
                    >
                      <div className="font-medium">{store.name}</div>
                      {store.address && (
                        <div className="text-sm text-muted-foreground">
                          {store.address}
                        </div>
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedStoreIds.length === 0}
          >
            {submitting
              ? 'Reactivating...'
              : `Reactivate ${selectedStoreIds.length} Store${selectedStoreIds.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

