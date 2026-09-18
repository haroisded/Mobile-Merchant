import { router } from 'expo-router';
import { useState } from 'react';

import { useShellMerchant } from '../../../../../features/merchants/queries';
import { RESOURCE_META } from '../../../../../features/products/resources';
import type { ProductType } from '../../../../../features/products/schema';
import { ProductForm } from '../../../../../screens/product-form';
import { TypeChooser } from '../../../../../screens/product-form/type-chooser';

// Rentables is the one screen with two types, so it asks which one before the form opens: the type
// decides the form's sections and cannot be changed after the first save.
export default function NewRentableScreen() {
  const merchant = useShellMerchant();
  const [type, setType] = useState<ProductType | null>(null);

  if (type === null) {
    return (
      <TypeChooser
        title="What are you adding?"
        hint="This decides what the form asks for, and it cannot be changed later."
        types={RESOURCE_META.rentables.types}
        onPick={setType}
        onBack={() => router.back()}
      />
    );
  }

  return <ProductForm merchantId={merchant.id} currency={merchant.currency} scope="rentables" type={type} product={null} />;
}
