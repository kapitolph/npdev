import { Text } from "ink";
import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { icons } from "../theme";

interface Props {
  label?: string;
}

export function Spinner({ label }: Props) {
  const theme = useTheme();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % icons.spinner.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color={theme.accent}>
      {icons.spinner[frame]} {label && <Text color={theme.overlay1}>{label}</Text>}
    </Text>
  );
}
