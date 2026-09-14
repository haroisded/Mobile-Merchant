import { useLocalSearchParams } from 'expo-router';

import { useShellMerchant } from '../../../../../../features/merchants/queries';
import { ProductGate } from '../../../../../../features/products/ProductDetail';
import { ProductForm } from '../../../../../../features/products/ProductForm';

export default function EditProductScreen() {
  const merchant = useShellMerchant();
  const { productId } = useLocalSearchParams<{ productId: string }>();

  // The gate mounts the form only once the product has loaded, so its defaultValues are the saved
  // product on the first render.
  return (
    <ProductGate id={productId}>
      {(product) => <ProductForm merchantId={merchant.id} currency={merchant.currency} product={product} />}
    </ProductGate>
  );
}
