'use client';
import { displayFlow } from '@/types/flow';
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export const SelectFlow = ({
  flowTypes,
  defaultFlowTypeId,
  onChange,
}: {
  flowTypes: displayFlow[];
  defaultFlowTypeId?: string;
  onChange?: (value: string) => void;
}) => {
  const safeFlowTypes = Array.isArray(flowTypes) ? flowTypes : [];
  const hasFlowTypes = safeFlowTypes.length > 0;
  return (
    <Select
      disabled={!hasFlowTypes}
      onValueChange={(value) => onChange?.(value)}
      defaultValue={defaultFlowTypeId}
    >
      <SelectTrigger
        className="h-10 w-full truncate md:w-[320px]"
        disabled={!hasFlowTypes}
      >
        <SelectValue placeholder="请选择需要操作的类别" />
      </SelectTrigger>
      {hasFlowTypes && (
        <SelectContent>
          {safeFlowTypes.map((flowType) => (
            <SelectItem
              key={`flowType_${flowType.id}`}
              value={flowType.id.toString()}
            >
              {flowType.title}
            </SelectItem>
          ))}
        </SelectContent>
      )}
    </Select>
  );
};
