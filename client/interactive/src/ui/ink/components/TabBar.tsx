import { Box, Text } from "ink";
import { useTheme } from "../context/ThemeContext";

interface Props {
  activeTab: "sessions" | "team";
  sessionCount: number;
  teamCount: number;
}

export function TabBar({ activeTab, sessionCount, teamCount }: Props) {
  const theme = useTheme();

  return (
    <Box gap={2}>
      <Text
        bold={activeTab === "sessions"}
        color={activeTab === "sessions" ? theme.tabActive : theme.tabInactive}
      >
        {activeTab === "sessions" ? "[ " : "  "}Sessions ({sessionCount})
        {activeTab === "sessions" ? " ]" : "  "}
      </Text>
      {teamCount > 0 && (
        <Text
          bold={activeTab === "team"}
          color={activeTab === "team" ? theme.tabActive : theme.tabInactive}
        >
          {activeTab === "team" ? "[ " : "  "}Team ({teamCount}){activeTab === "team" ? " ]" : "  "}
        </Text>
      )}
    </Box>
  );
}
