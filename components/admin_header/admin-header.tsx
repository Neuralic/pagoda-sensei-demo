import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import Logo from "../../public/assets/images/pagodalogo.jpg";
import { useRouter } from "next/navigation";
import { Bell } from 'lucide-react';

const AdminHeader = () => {
    const router = useRouter();
    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch {
            // ignore network errors; still attempt redirect
        } finally {

            router.push("/auth/login");
        }
    };
    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div>
                            <Image
                                src={Logo}
                                alt="Pagoda.travel"
                                className="h-7 w-auto sm:h-8 md:h-9 lg:h-10"
                                priority
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button className="relative p-2 hover:bg-gray-100 rounded-lg">
                        <Bell className="w-5 h-5 text-gray-600" />
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                    </button>
                    <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full"></div>
                </div>
            </div>
        </header>
    )
}

export default AdminHeader