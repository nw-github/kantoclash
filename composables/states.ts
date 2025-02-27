import type { Challenge } from "~/server/gameServer";
import type { Team } from "~/utils/pokemon";

export const useMyId = () => {
  const { user } = useUserSession();
  return computed(() => user.value?.id ?? "");
};

export const useMyTeams = () => useLocalStorage<Team[]>("myTeams", () => []);

export const useCurrentTrack = () => useState<string | undefined>("currentTrack", () => undefined);

export const allMusicTracks = Object.keys(import.meta.glob("/public/music/**/*.{mp3,wav}"));

export const musicTrackName = (track: string) => {
  return track.slice(track.lastIndexOf("/") + 1, track.lastIndexOf("."));
};

export const useSfxVolume = () => useLocalStorage("sfxVolume", 0.4);

export const useMusicVolume = () => useLocalStorage("musicVolume", 0.4);

export const useMutedPlayerIds = () => useLocalStorage<string[]>("mutedPlayers", []);

export const useChatCensorEnabled = () => useLocalStorage<boolean>("profanity", true);

export const useIgnoreChallenges = () => useLocalStorage<boolean>("ignoreChallenges", false);

export const useChallenges = () => useState<Challenge[]>("challenges", () => []);
