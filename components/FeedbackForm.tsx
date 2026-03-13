import React, { useState } from 'react';
import { StarIcon } from './Icons';

interface FeedbackFormProps {
    onSubmit: (feedback: { rating: number; comments: string }) => void;
    onCancel: () => void;
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({ onSubmit, onCancel }) => {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comments, setComments] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (rating > 0) {
            onSubmit({ rating, comments });
        }
    };

    return (
        <div className="w-full max-w-md bg-white/90 backdrop-blur-sm rounded-xl shadow-2xl p-6 text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">How safe was your trip?</h2>
            <p className="text-gray-600 mb-4">Your feedback helps improve future routes.</p>
            
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label htmlFor="rating" className="block text-sm font-medium text-gray-700 mb-2">
                        Perceived safety
                    </label>
                    <div 
                        className="flex justify-center items-center gap-2"
                        onMouseLeave={() => setHoverRating(0)}
                        aria-label="Rate the safety of your trip from 1 to 5 stars"
                    >
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                type="button"
                                key={star}
                                className="text-yellow-400 hover:text-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 rounded-full transition-transform transform hover:scale-110"
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                aria-label={`Rate ${star} out of 5 stars`}
                                aria-pressed={rating === star}
                            >
                                <StarIcon 
                                    className="w-8 h-8" 
                                    filled={(hoverRating || rating) >= star} 
                                />
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mb-6">
                    <label htmlFor="comments" className="block text-sm font-medium text-gray-700 mb-2">
                        Comments (optional)
                    </label>
                    <textarea
                        id="comments"
                        rows={3}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Any comments about the route?"
                    />
                </div>

                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="w-full bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded-lg shadow-sm hover:bg-gray-300 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={rating === 0}
                        className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        Submit
                    </button>
                </div>
            </form>
        </div>
    );
};

export default FeedbackForm;