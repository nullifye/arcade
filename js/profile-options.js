// Player profile choices. `value`s for user types must match the user_type checks in the hub's supabase/arked.sql.

export const USER_TYPES = [
  { value: 'pelajar', label: 'Pelajar' },
  { value: 'staf', label: 'Staf' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'awam', label: 'Orang Awam' },
];

export const userTypeLabel = (value) => USER_TYPES.find((t) => t.value === value)?.label ?? value;

// UiTM campuses grouped by state. Edit freely; the campus name is stored as text (max 60 chars).
export const CAMPUSES = [
  { state: 'Selangor', items: ['UiTM Shah Alam', 'UiTM Puncak Alam', 'UiTM Puncak Perdana', 'UiTM Sungai Buloh', 'UiTM Dengkil', 'UiTM Selayang'] },
  { state: 'Johor', items: ['UiTM Segamat', 'UiTM Pasir Gudang'] },
  { state: 'Kedah', items: ['UiTM Sungai Petani'] },
  { state: 'Kelantan', items: ['UiTM Machang', 'UiTM Kota Bharu'] },
  { state: 'Melaka', items: ['UiTM Alor Gajah', 'UiTM Bandaraya Melaka', 'UiTM Jasin'] },
  { state: 'Negeri Sembilan', items: ['UiTM Kuala Pilah', 'UiTM Seremban', 'UiTM Rembau'] },
  { state: 'Pahang', items: ['UiTM Jengka', 'UiTM Raub'] },
  { state: 'Perak', items: ['UiTM Seri Iskandar', 'UiTM Tapah', 'UiTM Teluk Intan'] },
  { state: 'Perlis', items: ['UiTM Arau'] },
  { state: 'Pulau Pinang', items: ['UiTM Permatang Pauh', 'UiTM Bertam'] },
  { state: 'Sabah', items: ['UiTM Kota Kinabalu', 'UiTM Tawau'] },
  { state: 'Sarawak', items: ['UiTM Samarahan', 'UiTM Mukah'] },
  { state: 'Terengganu', items: ['UiTM Dungun', 'UiTM Bukit Besi', 'UiTM Kuala Terengganu'] },
  { state: 'Lain-lain', items: ['Bukan warga UiTM'] },
];

/** Default campus for the Orang Awam category. */
export const NON_UITM_CAMPUS = 'Bukan warga UiTM';
