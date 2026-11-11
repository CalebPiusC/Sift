import { PublicReceipt } from '../../../components/receipts/public-receipt';
export const metadata = { robots: { index: false, follow: false } };
export default function SharedReceipt() {
  return <PublicReceipt allowSample={process.env.DATA_MODE === 'mock'} />;
}
