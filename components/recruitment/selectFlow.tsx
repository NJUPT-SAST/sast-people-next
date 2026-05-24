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
  return (
    <Select
      onValueChange={(value) => onChange?.(value)}
      defaultValue={defaultFlowTypeId}
    >
      <SelectTrigger className="w-[280px] truncate">
        <SelectValue placeholder="请选择需要操作的类别" />
      </SelectTrigger>
      <SelectContent>
        {flowTypes.map((flowType) => (
          <SelectItem
            key={`flowType_${flowType.id}`}
            value={flowType.id.toString()}
          >
            {flowType.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
