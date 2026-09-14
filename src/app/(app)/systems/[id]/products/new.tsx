import { useShellMerchant } from '../../../../../features/merchants/queries';
import { ProductForm } from '../../../../../features/products/ProductForm';

export default function NewProductScreen() {
  const merchant = useShellMerchant();

  return <ProductForm merchantId={merchant.id} currency={merchant.currency} product={null} />;
}
