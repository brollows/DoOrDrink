import { useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { photoFromFile } from '../photo';
import { Avatar } from './Avatar';

type Props = {
  /** Used for the initial and colour when there is no photo. */
  player: { id: string; name: string };
  photo: string | null;
  /** Called with a cropped JPEG data URL, or null to remove the photo. */
  onChange: (photo: string | null) => unknown;
  onError: (message: string) => void;
  disabled?: boolean;
};

/** Take a selfie or pick a photo, with a preview and a way to remove it. */
export function PhotoPicker({ player, photo, onChange, onError, disabled = false }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const blocked = disabled || working;

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so picking the same file again still triggers a change.
    event.target.value = '';
    if (!file) return;
    setWorking(true);
    try { await onChange(await photoFromFile(file)); }
    catch (error) { onError((error as Error).message); }
    finally { setWorking(false); }
  };

  return (
    <div className="photo-picker">
      <Avatar player={{ ...player, name: player.name.trim() || '?' }} photo={photo} className="photo-preview" />
      <div className="photo-actions">
        <button type="button" className="button secondary" disabled={blocked} onClick={() => camera.current?.click()}><Camera size={18} /> Ta bilde</button>
        <button type="button" className="button secondary" disabled={blocked} onClick={() => library.current?.click()}><ImagePlus size={18} /> {photo ? 'Bytt' : 'Velg bilde'}</button>
        {photo && <button type="button" className="undo-button" disabled={blocked} onClick={() => void onChange(null)}><Trash2 size={15} /> Fjern bildet</button>}
      </div>
      {/* capture opens the front camera on phones; elsewhere both open the file picker. */}
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={event => void choose(event)} />
      <input ref={library} type="file" accept="image/*" hidden onChange={event => void choose(event)} />
    </div>
  );
}
