// src/api.ts

export interface SpotifyTrackInfo {
  url: string;
  albumArtUrl?: string;
  releaseYear?: string;
}

export interface MusicBrainzInfo {
  releaseYear?: string;
  genres: string[];
}

export interface ITunesTrackInfo {
  albumArtUrl?: string;
  releaseYear?: string;
  genre?: string;
  albumName?: string;
}

export const cleanTitleString = (title: string): string => {
  return title
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/（.*?）/g, '')
    .replace(/［.*?］/g, '')
    .trim();
};

const cleanCompareString = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]（）［］'"]/g, '')
    .replace(/feat\.?/g, '')
    .replace(/and/g, '')
    .replace(/with/g, '')
    .trim();
};

const validateResult = (origTitle: string, origArtist: string, resTitle: string, resArtist: string): boolean => {
  const cOrigTitle = cleanCompareString(cleanTitleString(origTitle));
  const cOrigArtist = cleanCompareString(origArtist);
  const cResTitle = cleanCompareString(cleanTitleString(resTitle));
  const cResArtist = cleanCompareString(resArtist);

  if (!cOrigTitle || !cOrigArtist) return true;

  const titleMatches = cResTitle.includes(cOrigTitle) || cOrigTitle.includes(cResTitle);
  const artistMatches = cResArtist.includes(cOrigArtist) || cOrigArtist.includes(cResArtist);

  return titleMatches && artistMatches;
};

let spotifyAccessToken: string | null = null;
let spotifyTokenExpiresAt: number = 0;

export const getSpotifyToken = async (): Promise<string | null> => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === 'your_client_id_here') {
    return null;
  }

  if (spotifyAccessToken && Date.now() < spotifyTokenExpiresAt) {
    return spotifyAccessToken;
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
      },
      body: 'grant_type=client_credentials'
    });

    if (response.ok) {
      const data = await response.json();
      spotifyAccessToken = data.access_token;
      spotifyTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      return spotifyAccessToken;
    }
  } catch (error) {
    console.error('Failed to get Spotify token:', error);
  }

  return null;
};

export const searchSpotifyTrack = async (title: string, artist: string): Promise<SpotifyTrackInfo | null> => {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const cleanTitle = cleanTitleString(title);
    const query = encodeURIComponent(`track:${cleanTitle} artist:${artist}`);
    const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      const track = data.tracks?.items?.[0];
      if (track) {
        const trackTitle = track.name || '';
        const trackArtist = track.artists?.map((a: any) => a.name).join(', ') || '';
        if (validateResult(title, artist, trackTitle, trackArtist)) {
          return {
            url: track.external_urls?.spotify,
            albumArtUrl: track.album?.images?.[0]?.url,
            releaseYear: track.album?.release_date?.substring(0, 4)
          };
        } else {
          console.warn(`Spotify match rejected. Expected: "${title}" by "${artist}", Got: "${trackTitle}" by "${trackArtist}"`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to search Spotify track:', error);
  }

  return null;
};

export const getMusicBrainzData = async (title: string, artist: string): Promise<MusicBrainzInfo | null> => {
  try {
    const cleanTitle = cleanTitleString(title);
    const query = encodeURIComponent(`recording:"${cleanTitle}" AND artist:"${artist}"`);
    const response = await fetch(`https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json`, {
      headers: {
        // MusicBrainz requires a descriptive User-Agent
        'User-Agent': 'DesktopMusicWidget/1.0 ( https://github.com/example/widget )'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const recording = data.recordings?.[0];
      if (recording) {
        const trackTitle = recording.title || '';
        const trackArtist = recording['artist-credit']?.map((c: any) => c.name).join(', ') || '';
        if (validateResult(title, artist, trackTitle, trackArtist)) {
          // Find earliest release year
          const releases = recording.releases || [];
          let earliestYear = 9999;
          for (const r of releases) {
            if (r.date) {
              const year = parseInt(r.date.substring(0, 4), 10);
              if (!isNaN(year) && year > 1900 && year < earliestYear) {
                earliestYear = year;
              }
            }
          }

          // Find tags/genres
          const tags = recording.tags || [];
          tags.sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
          const genres = tags.slice(0, 3).map((t: any) => t.name);

          return {
            releaseYear: earliestYear !== 9999 ? earliestYear.toString() : undefined,
            genres
          };
        } else {
          console.warn(`MusicBrainz match rejected. Expected: "${title}" by "${artist}", Got: "${trackTitle}" by "${trackArtist}"`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to get MusicBrainz data:', error);
  }

  return null;
};

export const searchiTunesTrack = async (title: string, artist: string): Promise<ITunesTrackInfo | null> => {
  try {
    const cleanTitle = cleanTitleString(title);
    const query = encodeURIComponent(`${cleanTitle} ${artist}`);
    const response = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
    if (response.ok) {
      const data = await response.json();
      const track = data.results?.[0];
      if (track) {
        const trackTitle = track.trackName || '';
        const trackArtist = track.artistName || '';
        if (validateResult(title, artist, trackTitle, trackArtist)) {
          return {
            albumArtUrl: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg') : undefined,
            releaseYear: track.releaseDate ? track.releaseDate.substring(0, 4) : undefined,
            genre: track.primaryGenreName,
            albumName: track.collectionName
          };
        } else {
          console.warn(`iTunes match rejected. Expected: "${title}" by "${artist}", Got: "${trackTitle}" by "${trackArtist}"`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to search iTunes track:', error);
  }
  return null;
};

