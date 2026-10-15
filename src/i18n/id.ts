/** Indonesian. The key is the English text; anything missing here shows in English. */
export const id: Record<string, string> = {
  // Navigation and common
  Language: 'Bahasa',
  Main: 'Utama',
  Today: 'Hari ini',
  Tomorrow: 'Besok',
  Tasks: 'Tugas',
  Stats: 'Statistik',
  Backup: 'Cadangan',
  Cancel: 'Batal',
  Close: 'Tutup',
  OK: 'OK',
  Back: 'Kembali',
  Skip: 'Lewati',
  Next: 'Lanjut',
  Delete: 'Hapus',
  Done: 'Selesai',
  New: 'Baru',
  Locked: 'Terkunci',
  Level: 'Level',
  Perfect: 'Sempurna',
  Streak: 'Beruntun',
  Missed: 'Terlewat',
  Rest: 'Libur',
  photo: 'foto',
  photos: 'foto',
  task: 'tugas',
  tasks: 'tugas',
  day: 'hari',
  days: 'hari',

  // Dates and recurrence
  '1 week': '1 minggu',
  '{n} weeks': '{n} minggu',
  'Every day': 'Setiap hari',
  'Every {days}': 'Setiap {days}',
  '{list} and {last}': '{list} dan {last}',
  'Every {n} days': 'Setiap {n} hari',
  'Every N days': 'Setiap N hari',
  Every: 'Setiap',
  Weekdays: 'Hari tertentu',
  'Pick at least one weekday.': 'Pilih setidaknya satu hari.',
  'Weekdays must be between 0 and 6.': 'Hari harus antara 0 dan 6.',
  'Interval must be a whole number of days, 1 or more.': 'Jeda harus berupa bilangan bulat hari, 1 atau lebih.',
  'Interval needs a valid start date.': 'Jeda memerlukan tanggal mulai yang valid.',

  // Today
  '{xp} XP in total': 'Total {xp} XP',
  'Day streak': 'Runtun hari',
  'Perfect streak': 'Runtun sempurna',
  'Nothing scheduled today': 'Tidak ada jadwal hari ini',
  'Enjoy the rest day. Your streak carries on.': 'Nikmati hari liburmu. Runtunmu tetap berlanjut.',
  'No tasks yet': 'Belum ada tugas',
  'Add a task to start earning XP.': 'Tambahkan tugas untuk mulai mengumpulkan XP.',
  'Add a task': 'Tambah tugas',
  '{done} of {total} done': '{done} dari {total} selesai',
  'Photo needed': 'Perlu foto',
  'No photo': 'Tanpa foto',
  'Add proof': 'Tambah bukti',
  'Perfect day. {xp} XP bonus at midnight.': 'Hari sempurna. Bonus {xp} XP saat tengah malam.',
  'Streak kept: {xp} XP at midnight. Finish everything for {perfect} XP instead.':
    'Runtun terjaga: {xp} XP saat tengah malam. Selesaikan semuanya untuk {perfect} XP.',
  'Finish one task to keep your streak and avoid {xp} XP at midnight.':
    'Selesaikan satu tugas untuk menjaga runtunmu dan menghindari {xp} XP saat tengah malam.',

  // Tasks
  'Add task': 'Tambah tugas',
  'Add your first task': 'Tambah tugas pertamamu',
  'Add something you want to do regularly, like jogging every Sunday or reading every day.':
    'Tambahkan sesuatu yang ingin kamu lakukan rutin, misalnya jogging setiap Minggu atau membaca setiap hari.',
  'Edit task': 'Ubah tugas',
  'New task': 'Tugas baru',
  Task: 'Tugas',
  'e.g. Jogging': 'mis. Jogging',
  'How often': 'Seberapa sering',
  'Next: {dates}': 'Berikutnya: {dates}',
  'Delete for good?': 'Hapus permanen?',
  'Save changes': 'Simpan perubahan',
  'Past results stay in your history. The task stops appearing from today.':
    'Hasil sebelumnya tetap ada di riwayat. Tugas ini tidak muncul lagi mulai hari ini.',
  'Could not save the task.': 'Tugas tidak dapat disimpan.',
  'Could not delete the task.': 'Tugas tidak dapat dihapus.',
  'Give the task a title.': 'Beri judul pada tugas.',
  'Keep the title under 120 characters.': 'Judul maksimal 120 karakter.',
  'This task no longer exists.': 'Tugas ini sudah tidak ada.',

  // Proof
  'Take a photo as proof that you did it.': 'Ambil foto sebagai bukti bahwa kamu melakukannya.',
  'Preview of your proof photo': 'Pratinjau foto buktimu',
  'Preparing photo…': 'Menyiapkan foto…',
  'Take a photo': 'Ambil foto',
  Retake: 'Ulangi',
  'Mark done · +{xp} XP': 'Tandai selesai · +{xp} XP',
  'View proof for {label}': 'Lihat bukti untuk {label}',
  'Proof photo for {title}': 'Foto bukti untuk {title}',
  'Could not read that photo.': 'Foto tidak dapat dibaca.',
  'Could not save your progress.': 'Kemajuanmu tidak dapat disimpan.',
  'Choose an image file.': 'Pilih file gambar.',
  'That photo is too large. Try one under 30 MB.': 'Foto terlalu besar. Coba yang di bawah 30 MB.',
  "This browser can't read that image format. Try a JPEG or PNG photo.":
    'Peramban ini tidak dapat membaca format gambar itu. Coba foto JPEG atau PNG.',
  'Could not process the photo.': 'Foto tidak dapat diproses.',
  'Add a photo as proof first.': 'Tambahkan foto bukti terlebih dahulu.',
  'This task is no longer on your list.': 'Tugas ini sudah tidak ada di daftarmu.',
  'This task is already done.': 'Tugas ini sudah selesai.',
  'That day is over, so this task has expired.': 'Hari itu sudah berlalu, jadi tugas ini kedaluwarsa.',
  'This task is not due yet.': 'Tugas ini belum waktunya.',

  // Stats
  'Perfect day': 'Hari sempurna',
  'Streak day': 'Hari beruntun',
  'Missed day': 'Hari terlewat',
  'Rest day': 'Hari libur',
  '{into} of {need} XP to level {next}. Total {total} XP.': '{into} dari {need} XP menuju level {next}. Total {total} XP.',
  Streaks: 'Runtun',
  'Streak now': 'Runtun saat ini',
  'Best streak': 'Runtun terbaik',
  'Perfect now': 'Sempurna saat ini',
  'Best perfect': 'Sempurna terbaik',
  'Counted in days, up to yesterday.': 'Dihitung dalam hari, sampai kemarin.',
  'Last {n} weeks': '{n} minggu terakhir',
  '{perfect} perfect, {streak} streak, {missed} missed, {rest} rest.':
    '{perfect} sempurna, {streak} beruntun, {missed} terlewat, {rest} libur.',
  'Day by day results, Monday to Sunday': 'Hasil per hari, Senin sampai Minggu',
  upcoming: 'akan datang',
  'today, still in progress': 'hari ini, masih berjalan',
  'no result': 'tanpa hasil',
  Achievements: 'Pencapaian',
  '{done} of {total} unlocked': '{done} dari {total} terbuka',
  'First streak': 'Runtun pertama',
  'Finish at least one task in a day.': 'Selesaikan setidaknya satu tugas dalam sehari.',
  'First perfect day': 'Hari sempurna pertama',
  'Finish every task scheduled for a day.': 'Selesaikan semua tugas yang dijadwalkan dalam sehari.',
  '{weeks} streak': 'Runtun {weeks}',
  'Keep your streak going for {weeks} straight. Perfect days count too.':
    'Jaga runtunmu selama {weeks} berturut-turut. Hari sempurna juga dihitung.',
  '{weeks} perfect': 'Sempurna {weeks}',
  'Have a perfect day, every day, for {weeks} straight.': 'Raih hari sempurna setiap hari selama {weeks} berturut-turut.',
  'First break': 'Putus pertama',
  'Lose a running streak for the first time. Start again the next day.':
    'Kehilangan runtun untuk pertama kalinya. Mulai lagi keesokan harinya.',
  'Level {n}': 'Level {n}',
  'Reach level {n}.': 'Capai level {n}.',

  // Backup, export, import
  'Backup reminder': 'Pengingat cadangan',
  "You haven't made a backup yet. Export one so your progress survives if this device is lost or cleared.":
    'Kamu belum membuat cadangan. Ekspor satu agar kemajuanmu aman jika perangkat ini hilang atau dibersihkan.',
  'Your last backup was {ago} ago.': 'Cadangan terakhirmu {ago} yang lalu.',
  'Back up now': 'Cadangkan sekarang',
  Later: 'Nanti',
  Export: 'Ekspor',
  Import: 'Impor',
  'Could not create the backup. {detail}': 'Cadangan tidak dapat dibuat. {detail}',
  'Could not create the backup.': 'Cadangan tidak dapat dibuat.',
  'Save your tasks, XP and photos to one file. Open it on another device with Import.':
    'Simpan tugas, XP, dan fotomu ke satu file. Buka di perangkat lain dengan Impor.',
  'Include photos': 'Sertakan foto',
  'No photos yet.': 'Belum ada foto.',
  '{photos}, about {size}.': '{photos}, sekitar {size}.',
  'Password (optional)': 'Kata sandi (opsional)',
  "Encrypts the file. If you forget the password, the backup can't be opened. Without a password, anyone who has the file can see your tasks and photos.":
    'Mengenkripsi file. Jika kamu lupa kata sandi, cadangan tidak dapat dibuka. Tanpa kata sandi, siapa pun yang memiliki file dapat melihat tugas dan fotomu.',
  'Repeat password': 'Ulangi kata sandi',
  'Use at least {n} characters.': 'Gunakan minimal {n} karakter.',
  "The passwords don't match.": 'Kata sandi tidak cocok.',
  'Exporting…': 'Mengekspor…',
  'Export backup': 'Ekspor cadangan',
  'Saved {name}. Keep it somewhere safe.': '{name} tersimpan. Simpan di tempat yang aman.',
  'Last export: {when}.': 'Ekspor terakhir: {when}.',
  "You haven't exported yet.": 'Kamu belum pernah mengekspor.',
  'Open a backup file made with Export.': 'Buka file cadangan yang dibuat dengan Ekspor.',
  'Reading…': 'Membaca…',
  'Choose backup file': 'Pilih file cadangan',
  'is encrypted.': 'terenkripsi.',
  Password: 'Kata sandi',
  'Unlocking…': 'Membuka…',
  Unlock: 'Buka',
  'Backup from {when}: {tasks}, {days} of history, {photos}.': 'Cadangan dari {when}: {tasks}, riwayat {days}, {photos}.',
  'How to import': 'Cara mengimpor',
  'Merge with this device': 'Gabungkan dengan perangkat ini',
  'Keeps what is here and adds what is new. A task finished on either device stays finished.':
    'Mempertahankan yang ada di sini dan menambah yang baru. Tugas yang selesai di salah satu perangkat tetap selesai.',
  'Replace this device': 'Ganti isi perangkat ini',
  'Deletes everything here and uses the file. Anything done after the backup was made is lost.':
    'Menghapus semua yang ada di sini dan memakai isi file. Apa pun yang dikerjakan setelah cadangan dibuat akan hilang.',
  'Importing…': 'Mengimpor…',
  'Merge backup': 'Gabungkan cadangan',
  'Yes, replace everything': 'Ya, ganti semuanya',
  'Replace everything': 'Ganti semuanya',
  'Imported. This device now has {tasks} and {photos}.': 'Berhasil diimpor. Perangkat ini sekarang memiliki {tasks} dan {photos}.',
  'The import failed and nothing was changed. {detail}': 'Impor gagal dan tidak ada yang berubah. {detail}',
  'The import failed and nothing was changed.': 'Impor gagal dan tidak ada yang berubah.',
  "That file isn't a Daily Quest backup. Choose a file made with Export.":
    'File itu bukan cadangan Daily Quest. Pilih file yang dibuat dengan Ekspor.',
  'This backup was made by a newer version of the app. Update the app, then try again.':
    'Cadangan ini dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi, lalu coba lagi.',
  'This backup is encrypted. Enter its password.': 'Cadangan ini terenkripsi. Masukkan kata sandinya.',
  'Wrong password, or the file is damaged. Check the password and try again.':
    'Kata sandi salah, atau file rusak. Periksa kata sandi dan coba lagi.',
  "The backup is damaged and can't be imported. {detail}": 'Cadangan rusak dan tidak dapat diimpor. {detail}',
  'Something went wrong while reading the file. Try again.': 'Terjadi masalah saat membaca file. Coba lagi.',
  'Password cannot be empty.': 'Kata sandi tidak boleh kosong.',

  // This app (install, offline, storage)
  'A new version is ready.': 'Versi baru sudah tersedia.',
  Reload: 'Muat ulang',
  'Saved for offline use. The app now works without a connection.': 'Tersimpan untuk penggunaan offline. Aplikasi kini berfungsi tanpa koneksi.',
  'This app': 'Aplikasi ini',
  Offline: 'Offline',
  'Ready. The app works without a connection.': 'Siap. Aplikasi berfungsi tanpa koneksi.',
  'Not ready yet. Open the app once while online and it saves itself.':
    'Belum siap. Buka aplikasi sekali saat online dan aplikasi akan menyimpan dirinya.',
  Install: 'Pasang',
  'Installed on this device.': 'Terpasang di perangkat ini.',
  'Add it to your home screen to open it like any other app.': 'Tambahkan ke layar utama agar bisa dibuka seperti aplikasi lain.',
  'On iPhone or iPad, tap Share, then Add to Home Screen.': 'Di iPhone atau iPad, ketuk Bagikan, lalu Tambah ke Layar Utama.',
  "Use your browser's menu and look for Install app or Add to Home screen.":
    'Buka menu peramban dan cari Pasang aplikasi atau Tambahkan ke layar utama.',
  'Install app': 'Pasang aplikasi',
  Storage: 'Penyimpanan',
  "This browser can't say whether your data is protected. Export a backup now and then.":
    'Peramban ini tidak bisa memastikan apakah datamu terlindungi. Ekspor cadangan sesekali.',
  "Protected. The browser won't clear your data on its own.": 'Terlindungi. Peramban tidak akan menghapus datamu sendiri.',
  'Not protected. The browser can clear your data if the device runs low on space.':
    'Belum terlindungi. Peramban dapat menghapus datamu jika ruang perangkat menipis.',
  'Using {size}.': 'Memakai {size}.',
  'Protect my data': 'Lindungi data saya',
  "Your browser didn't allow it. Installing the app usually helps. Until then, export a backup now and then.":
    'Peramban tidak mengizinkannya. Memasang aplikasi biasanya membantu. Sementara itu, ekspor cadangan sesekali.',

  // About and privacy
  'About and privacy': 'Tentang dan privasi',
  'Your tasks, photos and XP are stored only in this browser, on this device.':
    'Tugas, foto, dan XP-mu hanya disimpan di peramban ini, di perangkat ini.',
  'Nothing is sent to a server. There are no accounts, ads or tracking.': 'Tidak ada yang dikirim ke server. Tidak ada akun, iklan, atau pelacakan.',
  'A backup file contains everything, photos included. Add a password when you export it if you will keep it online.':
    'File cadangan berisi semuanya, termasuk foto. Beri kata sandi saat mengekspor jika akan disimpan secara online.',
  'Clearing site data or removing the app deletes your progress unless you have a backup.':
    'Menghapus data situs atau mencopot aplikasi akan menghapus kemajuanmu kecuali kamu punya cadangan.',
  'Version {version}': 'Versi {version}',

  // Welcome
  'Read 10 pages': 'Baca 10 halaman',
  'Step {n} of {total}': 'Langkah {n} dari {total}',
  'Welcome to Daily Quest': 'Selamat datang di Daily Quest',
  'Turn your daily routine into a game. Finish your tasks, earn XP, build streaks and level up.':
    'Ubah rutinitas harianmu menjadi permainan. Selesaikan tugas, kumpulkan XP, bangun runtun, dan naik level.',
  'Everything stays on this device. There is no account and nothing is uploaded.':
    'Semuanya tetap di perangkat ini. Tidak ada akun dan tidak ada yang diunggah.',
  'How it works': 'Cara kerjanya',
  'Add tasks and choose how often they repeat.': 'Tambahkan tugas dan pilih seberapa sering tugas itu berulang.',
  'A task is done only when you add a photo as proof. Each one earns {xp} XP.':
    'Tugas dianggap selesai hanya jika kamu menambahkan foto sebagai bukti. Setiap tugas bernilai {xp} XP.',
  'Each day ends at midnight. A task you did not finish expires and earns nothing.':
    'Setiap hari berakhir saat tengah malam. Tugas yang belum selesai kedaluwarsa dan tidak memberi apa-apa.',
  'Finish at least one task for a streak bonus. Finish them all for a bigger perfect-day bonus.':
    'Selesaikan setidaknya satu tugas untuk bonus runtun. Selesaikan semuanya untuk bonus hari sempurna yang lebih besar.',
  'Miss every task in a day and you lose XP.': 'Jika semua tugas dalam sehari terlewat, XP-mu berkurang.',
  'You can start with an example and change it later, or begin with an empty list.':
    'Kamu bisa mulai dengan contoh dan mengubahnya nanti, atau mulai dengan daftar kosong.',
  'Start empty': 'Mulai kosong',
  'Add "Read 10 pages"': 'Tambah "Baca 10 halaman"',

  // Problems and reports
  "Can't open your data": 'Data tidak dapat dibuka',
  "This browser wouldn't let the app open its storage. Your data has not been changed.":
    'Peramban ini tidak mengizinkan aplikasi membuka penyimpanannya. Datamu tidak berubah.',
  'Private or incognito windows often block storage. Open the app in a normal window.':
    'Jendela pribadi atau penyamaran sering memblokir penyimpanan. Buka aplikasi di jendela biasa.',
  'If the device is almost full, free some space and try again.': 'Jika perangkat hampir penuh, kosongkan ruang lalu coba lagi.',
  'Some browser settings and extensions block site storage. Allow it for this site.':
    'Beberapa pengaturan dan ekstensi peramban memblokir penyimpanan situs. Izinkan untuk situs ini.',
  'Try again': 'Coba lagi',
  'Problem report': 'Laporan masalah',
  problem: 'masalah',
  problems: 'masalah',
  'No problems recorded on this device.': 'Tidak ada masalah tercatat di perangkat ini.',
  '{problems} recorded on this device.': '{problems} tercatat di perangkat ini.',
  'If something goes wrong, copy the report and send it to whoever runs the app. It holds no tasks or photos, and it is never sent unless you send it.':
    'Jika ada yang salah, salin laporan dan kirim ke pengelola aplikasi. Laporan tidak berisi tugas atau foto, dan tidak pernah terkirim kecuali kamu mengirimnya.',
  'Copy report': 'Salin laporan',
  Clear: 'Hapus',
  'Copied.': 'Tersalin.',

  // Reminders
  'Daily reminder': 'Pengingat harian',
  "This browser can't show notifications.": 'Peramban ini tidak dapat menampilkan notifikasi.',
  'Remind me if tasks are left': 'Ingatkan aku jika masih ada tugas',
  'Notifications are blocked for this site. Allow them in your browser settings, then come back.':
    'Notifikasi diblokir untuk situs ini. Izinkan di pengaturan peramban, lalu kembali ke sini.',
  'One reminder a day. It only appears while the app is open or running in the background, not after it is closed.':
    'Satu pengingat per hari. Hanya muncul saat aplikasi terbuka atau berjalan di latar belakang, bukan setelah ditutup.',
  'Remind me at': 'Ingatkan pukul',
  '1 task is still waiting today.': '1 tugas masih menunggu hari ini.',
  '{n} tasks are still waiting today.': '{n} tugas masih menunggu hari ini.',
}
