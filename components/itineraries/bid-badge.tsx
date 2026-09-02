interface BidBadgeProps {
  count: number
}

export function BidBadge({ count }: BidBadgeProps) {
  return (
    <div className="absolute -top-2 -left-2 bg-gray-700 text-white text-xs font-semibold px-2 py-1 rounded-full">
      + {count} Bids
    </div>
  )
}
