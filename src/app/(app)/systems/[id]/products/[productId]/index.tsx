import { useLocalSearchParams } from 'expo-router';

import { useShellMerchant } from '../../../../../../features/merchants/queries';
import { ProductDetail, ProductGate } from '../../../../../../features/products/ProductDetail';

export default function ProductDetailScreen() {
  const merchant = useShellMerchant();
  // Every push to this route passes productId, so it is always in this route's own params.
  const { productId } = useLocalSearchParams<{ productId: string }>();

  return (
    <ProductGate id={productId}>
      {(product) => <ProductDetail merchantId={merchant.id} currency={merchant.currency} product={product} />}
    </ProductGate>
  );
}
