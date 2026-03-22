"use client"

import * as React from "react"
import ReactSelect, { StylesConfig, GroupBase } from "react-select"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  isSearchable?: boolean
  isDisabled?: boolean
  isClearable?: boolean
  "aria-label"?: string
  id?: string
}

const defaultStyles: StylesConfig<SelectOption, false, GroupBase<SelectOption>> = {
  control: (base, state) => ({
    ...base,
    minHeight: "36px",
    height: "36px",
    borderColor: state.isFocused ? "var(--ring)" : "var(--input)",
    boxShadow: state.isFocused ? "0 0 0 1px var(--ring)" : "none",
    "&:hover": {
      borderColor: "var(--ring)",
    },
    backgroundColor: "var(--background)",
    fontSize: "14px",
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "0 12px",
    height: "36px",
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
    color: "var(--foreground)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--foreground)",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "var(--background)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    zIndex: 50,
  }),
  menuList: (base) => ({
    ...base,
    padding: "4px",
    maxHeight: "300px",
    backgroundColor: "var(--background)",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "var(--primary)"
      : state.isFocused
      ? "var(--accent)"
      : "var(--background)",
    color: state.isSelected
      ? "var(--primary-foreground)"
      : "var(--foreground)",
    cursor: "pointer",
    borderRadius: "4px",
    margin: "2px 0",
    "&:active": {
      backgroundColor: "var(--primary)",
    },
  }),
  indicatorSeparator: () => ({
    display: "none",
  }),
  dropdownIndicator: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
    padding: "4px 8px",
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
    padding: "4px 8px",
  }),
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      options,
      value,
      onChange,
      placeholder = "Select...",
      className,
      isSearchable = true,
      isDisabled = false,
      isClearable = false,
      "aria-label": ariaLabel,
      id,
    },
    _ref
  ) => {
    const selectedOption = React.useMemo(
      () => options.find((opt) => opt.value === value) ?? null,
      [options, value]
    )

    return (
      <div className={cn("w-full", className)} ref={_ref}>
        <ReactSelect<SelectOption, false, GroupBase<SelectOption>>
          inputId={id}
          aria-label={ariaLabel}
          options={options}
          value={selectedOption}
          onChange={(option) => {
            if (onChange) {
              onChange(option?.value ?? "")
            }
          }}
          placeholder={placeholder}
          isSearchable={isSearchable}
          isDisabled={isDisabled}
          isClearable={isClearable}
          styles={defaultStyles}
          classNamePrefix="select"
          theme={(theme) => ({
            ...theme,
            colors: {
              ...theme.colors,
              primary: "var(--primary)",
              primary75: "var(--primary)",
              primary50: "var(--primary)",
              primary25: "var(--primary)",
            },
          })}
        />
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
