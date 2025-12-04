import { ChevronLeft, ChevronRight } from "lucide-react"
import * as React from "react"
import { DayPicker, type CaptionProps, type DayPickerSingleProps, useNavigation } from "react-day-picker"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// Static month labels – computed once outside any component
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2020, i, 1))
)

interface CustomCaptionProps extends CaptionProps {
  fromDate?: Date
  fromYear?: number
  toDate?: Date
  toYear?: number
}

function CustomCaption({ displayMonth, fromDate, fromYear, toDate, toYear }: CustomCaptionProps) {
  const { goToMonth } = useNavigation()
  const month = displayMonth.getMonth()
  const year = displayMonth.getFullYear()

  const minYear = fromDate ? fromDate.getFullYear() : fromYear ?? year - 5
  const maxYear = toDate ? toDate.getFullYear() : toYear ?? year + 5
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i)

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <select
          className="flex-1 rounded-md border border-input bg-background py-1.5 pl-2 pr-6 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={month}
          onChange={(e) => goToMonth(new Date(year, Number(e.target.value)))}
        >
          {MONTH_LABELS.map((label, idx) => (
            <option key={idx} value={idx}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="w-24 rounded-md border border-input bg-background py-1.5 pl-2 pr-6 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={year}
          onChange={(e) => goToMonth(new Date(Number(e.target.value), month))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  // Wrap CustomCaption so it receives DayPicker constraint props
  const CaptionComponent = React.useCallback(
    (captionProps: CaptionProps) => (
      <CustomCaption
        {...captionProps}
        fromDate={props.fromDate}
        fromYear={props.fromYear}
        toDate={props.toDate}
        toYear={props.toYear}
      />
    ),
    [props.fromDate, props.fromYear, props.toDate, props.toYear]
  )

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "pt-1",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }: React.ComponentProps<NonNullable<DayPickerSingleProps["components"]>["IconLeft"]>) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }: React.ComponentProps<NonNullable<DayPickerSingleProps["components"]>["IconRight"]>) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
        Caption: CaptionComponent,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
