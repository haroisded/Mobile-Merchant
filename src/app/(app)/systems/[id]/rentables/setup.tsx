import { useShellMerchant } from '../../../../../features/merchants/queries';
import { ProductSetup } from '../../../../../screens/product-setup';

export default function SetupScreen() {
  const merchant = useShellMerchant();

  return <ProductSetup merchantId={merchant.id} scope="rentables" />;
}
