export function formatDate(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: true,
  }).format(d);
}
