import React, { useState } from 'react';
import { XIcon, ChevronDownIcon } from './Icons';

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-700 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center py-4 text-left focus:outline-none group"
      >
        <span className="text-gray-200 font-medium group-hover:text-yellow-400 transition-colors pr-4">
            {question}
        </span>
        <ChevronDownIcon 
            className={`w-5 h-5 text-gray-400 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'transform rotate-180' : ''}`} 
        />
      </button>
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100 mb-4' : 'max-h-0 opacity-0'}`}
      >
        <p className="text-gray-400 text-sm leading-relaxed">
            {answer}
        </p>
      </div>
    </div>
  );
};

interface FAQProps {
  isOpen: boolean;
  onClose: () => void;
}

const faqs = [
  {
    question: "What does Defensive Pedal do?",
    answer: "Defensive Pedal finds the safest cycling route, not the shortest or fastest one. You trade a few extra minutes for much lower danger."
  },
  {
    question: "How is this different from Google Maps?",
    answer: "Defensive Pedal is the only app that optimizes for your safety, not for shortest route. On average our routes are ~85% safer."
  },
  {
    question: "How does the routing work?",
    answer: "Each street is scored using 25+ proven safety factors, including: road type & width, intersections, surface quality, bike infrastructure (where available). The app chooses the route with the lowest total risk, not the shortest path."
  },
  {
    question: "Does it only use bike lanes?",
    answer: "No. Bike lanes help, but they don’t cover whole cities—and some are unsafe. We find the safe route even where there are no bike lanes."
  },
  {
    question: "Will routes be much longer?",
    answer: "Routes are often slightly longer, but safer."
  },
  {
    question: "Where does the safety data come from?",
    answer: "Official European road safety research, OpenStreetMap infrastructure data, city-specific calibration, user-reported hazards."
  },
  {
    question: "Is my data safe?",
    answer: "Yes. Location is used only for navigation. Any aggregated data is fully anonymized."
  },
  {
    question: "Is Defensive Pedal free?",
    answer: "Yes. Safe routing is available in the free version. Optional premium features unlock extra safety tools."
  },
  {
    question: "Can you guarantee my safety?",
    answer: "No app can. What we do is reduce risk by avoiding dangerous streets. Cars are dangerous, always be careful when you ride."
  }
];

const FAQ: React.FC<FAQProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] bg-gray-900 flex flex-col text-white animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900 shadow-sm flex-shrink-0">
             <h2 className="text-2xl font-bold tracking-tight text-yellow-400">FAQ</h2>
             <button 
                onClick={onClose}
                className="p-2 rounded-full bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition"
                aria-label="Close FAQ"
             >
                 <XIcon className="w-6 h-6" />
             </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-2xl mx-auto space-y-2">
                {faqs.map((faq, index) => (
                    <FAQItem key={index} question={faq.question} answer={faq.answer} />
                ))}
            </div>
            
            <div className="mt-8 text-center">
                 <p className="text-gray-500 text-xs">
                     Have more questions? Contact us at victor@defensivepedal.com
                 </p>
            </div>
        </div>
    </div>
  );
};

export default FAQ;