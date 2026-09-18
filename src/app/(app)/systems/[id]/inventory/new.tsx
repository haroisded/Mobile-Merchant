import { useShellMerchant } from '../../../../../features/merchants/queries';
import { ProductForm } from '../../../../../screens/product-form';

// Inventory creates stock and consumables and nothing else, so there is nothing to ask first.
export default function NewItemScreen() {
  const merchant = useShellMerchant();

  return <ProductForm merchantId={merchant.id} currency={merchant.currency} scope="inventory" type="stock" product={null} />;
}
