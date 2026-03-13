import React from "react";
import { Text } from "ink";

const BRAND_BLUE = "#4B68FE";

export function Logo() {
  return (
    <>
      <Text color={BRAND_BLUE} bold>{"❯❯"}</Text>
      <Text color={BRAND_BLUE} bold>{" nextpay"}</Text>
    </>
  );
}
