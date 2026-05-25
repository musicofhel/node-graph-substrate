import { useParams } from "react-router";

export default function PackDetailPage() {
  const { packId } = useParams();
  return (
    <div className="p-6">
      <h1 className="text-lg font-medium text-neutral-200">Pack: {packId}</h1>
      <p className="mt-2 text-sm text-neutral-500">Pack manifest detail coming soon.</p>
    </div>
  );
}
