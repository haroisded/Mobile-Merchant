import { useShellMerchant } from '../../../../../features/merchants/queries';
import { ProductForm } from '../../../../../screens/product-form';

// Products creates flat services and nothing else, so there is nothing to ask first.
export default function NewProductScreen() {
  const merchant = useShellMerchant();

  return <ProductForm merchantId={merchant.id} currency={merchant.currency} scope="products" type="flat" product={null} />;
}
