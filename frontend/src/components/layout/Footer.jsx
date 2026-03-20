import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Twitter, Instagram, Youtube, MapPin, Phone, Mail } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-secondary/40 border-t mt-16 pt-12 pb-8">
      <div className="container px-4 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          
          <div className="col-span-1 md:col-span-1">
            <Link to="/" className="inline-block mb-4">
              <span className="font-bold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
                Premium Gadget
              </span>
            </Link>
            <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
              Bangladesh's most trusted destination for premium laptops, accessories, and expert repair services.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/products" className="hover:text-primary transition-colors">All Products</Link></li>
              <li><Link to="/products?category=laptops" className="hover:text-primary transition-colors">Laptops</Link></li>
              <li><Link to="/products?category=accessories" className="hover:text-primary transition-colors">Accessories</Link></li>
              <li><Link to="/repairs" className="hover:text-primary transition-colors">Repair Services</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-4">Customer Service</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/track-repair" className="hover:text-primary transition-colors">Track Repair</Link></li>
              <li><Link to="/shipping-policy" className="hover:text-primary transition-colors">Shipping Policy</Link></li>
              <li><Link to="/return-policy" className="hover:text-primary transition-colors">Returns & Refunds</Link></li>
              <li><Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-4">Contact Us</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start">
                <MapPin className="h-5 w-5 mr-3 text-primary shrink-0" />
                <span>Level 4, Multiplan Center, Elephant Road, Dhaka</span>
              </li>
              <li className="flex items-center">
                <Phone className="h-5 w-5 mr-3 text-primary shrink-0" />
                <span>+880 1711-000000</span>
              </li>
              <li className="flex items-center">
                <Mail className="h-5 w-5 mr-3 text-primary shrink-0" />
                <span>support@premiumgadget.com.bd</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t pt-8 text-center md:flex md:justify-between md:items-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Premium Gadget. All rights reserved.
          </p>
          <div className="mt-4 md:mt-0 flex justify-center space-x-4 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-primary">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-primary">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
