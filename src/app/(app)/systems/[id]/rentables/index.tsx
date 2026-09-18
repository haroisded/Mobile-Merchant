import { useShellMerchant } from '../../../../../features/merchants/queries';
import { ProductList } from '../../../../../screens/product-list';

export default function RentablesScreen() {
  // From the shell, not from this route's params: the rail navigates here with none.
  const merchant = useShellMerchant();

  return (
    <ProductList merchantId={merchant.id} merchantName={merchant.name} currency={merchant.currency} scope="rentables" />
  );
}
