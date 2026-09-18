import { useLocalSearchParams } from 'expo-router';

import { useShellMerchant } from '../../../../../../features/merchants/queries';
import { ProductGate } from '../../../../../../screens/product-detail';
import { ProductForm } from '../../../../../../screens/product-form';

export default function EditProductScreen() {
  const merchant = useShellMerchant();
  const { productId } = useLocalSearchParams<{ productId: string }>();

  // The gate mounts the form only once the product has loaded, so its defaultValues are the saved
  // product on the first render. `type` is unused when editing — a saved product keeps its type.
  return (
    <ProductGate id={productId} scope="inventory">
      {(product) => (
        <ProductForm
          merchantId={merchant.id}
          currency={merchant.currency}
          scope="inventory"
          type={product.type}
          product={product}
        />
      )}
    </ProductGate>
  );
}
