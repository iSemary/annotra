"use client"

import * as React from "react"
import Select, { StylesConfig, GroupBase } from "react-select"
import { cn } from "@/lib/utils"

export interface Select2Option {
  value: string
  label: string
  category?: string
}

export interface Select2Group {
  label: string
  options: Select2Option[]
}

export interface Select2Props {
  options: Select2Option[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  isSearchable?: boolean
  isDisabled?: boolean
}

export function Select2({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className,
  isSearchable = true,
  isDisabled = false,
}: Select2Props) {
  // Group options by category if they have categories
  const { processedOptions, isGrouped } = React.useMemo(() => {
    const hasCategories = options.some((opt) => opt.category)
    if (!hasCategories) {
      return { 
        processedOptions: options as Select2Option[], 
        isGrouped: false 
      }
    }

    const groups = new Map<string, Select2Option[]>()
    options.forEach((opt) => {
      const category = opt.category || "Other"
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(opt)
    })

    const grouped = Array.from(groups.entries()).map(([label, opts]) => ({
      label,
      options: opts,
    }))
    return { 
      processedOptions: grouped as Select2Group[], 
      isGrouped: true 
    }
  }, [options])
  
  // Find selected option - handle both flat and grouped structures
  const selectedOption = React.useMemo(() => {
    if (!value) return undefined
    if (isGrouped) {
      for (const group of processedOptions as Select2Group[]) {
        const found = group.options.find((opt) => opt.value === value)
        if (found) return found
      }
    } else {
      return (processedOptions as Select2Option[]).find((opt) => opt.value === value)
    }
    return undefined
  }, [value, processedOptions, isGrouped])

  const customStyles: StylesConfig<Select2Option, false, GroupBase<Select2Option>> = {
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
    groupHeading: (base) => ({
      ...base,
      fontSize: "12px",
      fontWeight: 600,
      textTransform: "uppercase",
      color: "var(--muted-foreground)",
      marginBottom: "4px",
      padding: "8px 12px",
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

  return (
    <div className={cn("w-full", className)}>
      <Select<Select2Option, false, GroupBase<Select2Option>>
        options={isGrouped ? (processedOptions as Select2Group[]) : (processedOptions as Select2Option[])}
        value={selectedOption}
        onChange={(option) => {
          if (onChange && option && !Array.isArray(option) && 'value' in option) {
            onChange(option.value)
          }
        }}
        placeholder={placeholder}
        isSearchable={isSearchable}
        isDisabled={isDisabled}
        styles={customStyles}
        classNamePrefix="select2"
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
