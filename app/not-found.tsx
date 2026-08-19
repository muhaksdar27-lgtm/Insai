import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-black text-zinc-100 font-sans">
      <h2 className="text-xl font-bold font-mono tracking-widest text-blue-400 mb-2 uppercase">
        404 - Halaman Tidak Ditemukan
      </h2>
      <p className="text-xs text-zinc-400 mb-6 max-w-md">
        Halaman atau rute yang Anda cari tidak tersedia pada sistem monitoring signal trading XAUUSD.
      </p>
      <Link
        href="/monitoring"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors"
      >
        Kembali ke Monitoring
      </Link>
    </div>
  );
}
