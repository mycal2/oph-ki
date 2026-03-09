"use client";

import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  disabled?: boolean;
  /** When true, validates each entry as a valid regex pattern on add. */
  validateRegex?: boolean;
  /** Custom validation function. Return an error message string to reject, or null to accept. */
  validate?: (value: string) => string | null;
}

export function TagInput({
  value,
  onChange,
  placeholder = "Eingabe + Enter",
  maxItems = 50,
  disabled = false,
  validateRegex = false,
  validate,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      // Case-insensitive duplicate check
      if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
      if (value.length >= maxItems) return;

      if (validateRegex) {
        try {
          new RegExp(trimmed);
        } catch {
          setValidationError(`Ungültiges Regex-Pattern: "${trimmed}"`);
          return;
        }
      }

      if (validate) {
        const error = validate(trimmed);
        if (error) {
          setValidationError(error);
          return;
        }
      }

      setValidationError(null);
      onChange([...value, trimmed]);
      setInputValue("");
    },
    [value, onChange, maxItems, validateRegex, validate]
  );

  const removeTag = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag(inputValue);
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        removeTag(value.length - 1);
      }
    },
    [inputValue, addTag, removeTag, value.length]
  );

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="gap-1 pr-1 font-mono text-xs"
            >
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeTag(index)}
                  className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                  aria-label={`${tag} entfernen`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && value.length < maxItems && (
        <Input
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (validationError) setValidationError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`font-mono text-sm ${validationError ? "border-destructive" : ""}`}
        />
      )}
      {validationError && (
        <p className="text-xs text-destructive">{validationError}</p>
      )}
    </div>
  );
}
