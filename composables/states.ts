import type { Challenge } from "~/server/gameServer";
import type { Team } from "~/utils/pokemon";

export const useMyId = () => {
  const { user } = useUserSession();
  return computed(() => user.value?.id ?? "");
};

export const useMyTeams = () => useLocalStorage<Team[]>("myTeams", () => []);

export const allMusicTracks = Object.keys(import.meta.glob("/public/music/**/*.{mp3,wav}"));

export const useSfxVolume = () => useLocalStorage("sfxVolume", 0.4);

export const useBGMusic = () => {
  return {
    volume: useLocalStorage("musicVolume", 0.4),
    track: useState<string | undefined>("currentTrack", () => undefined),
  };
};

export const useMutedPlayerIds = () => useLocalStorage<string[]>("mutedPlayers", []);

export const useChatCensorEnabled = () => useLocalStorage<boolean>("profanity", true);

export const useIgnoreChallenges = () => useLocalStorage<boolean>("ignoreChallenges", false);

export const useAutoMuteMusic = () => useLocalStorage<boolean>("autoMuteMusic", false);

export const useChallenges = () => useState<Challenge[]>("challenges", () => []);
