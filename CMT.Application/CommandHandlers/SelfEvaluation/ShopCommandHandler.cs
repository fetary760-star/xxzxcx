using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    public class ShopCommandHandler :
        IRequestHandler<CreateShopCommand, Guid>,
        IRequestHandler<UpdateShopCommand, bool>,
        IRequestHandler<DeleteShopCommand, bool>
    {
        private readonly ApplicationDbContext _context;

        public ShopCommandHandler(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Guid> Handle(CreateShopCommand request, CancellationToken cancellationToken)
        {
            var shop = new Shop
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                CertificateNumber = request.CertificateNumber,
                Address = request.Address,
                City = request.City,
                State = request.State,
                ZipCode = request.ZipCode,
                Country = request.Country,
                Phone = request.Phone,
                Email = request.Email,
                AccountableManager = request.AccountableManager,
                QualityManager = request.QualityManager,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.Shops.Add(shop);
            await _context.SaveChangesAsync(cancellationToken);

            return shop.Id;
        }

        public async Task<bool> Handle(UpdateShopCommand request, CancellationToken cancellationToken)
        {
            var shop = await _context.Shops.FindAsync(new object[] { request.Id }, cancellationToken);
            if (shop == null) return false;

            shop.Name = request.Name;
            shop.CertificateNumber = request.CertificateNumber;
            shop.Address = request.Address;
            shop.City = request.City;
            shop.State = request.State;
            shop.ZipCode = request.ZipCode;
            shop.Country = request.Country;
            shop.Phone = request.Phone;
            shop.Email = request.Email;
            shop.AccountableManager = request.AccountableManager;
            shop.QualityManager = request.QualityManager;
            shop.IsActive = request.IsActive;
            shop.UpdatedAt = DateTime.UtcNow;
            shop.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(DeleteShopCommand request, CancellationToken cancellationToken)
        {
            var shop = await _context.Shops.FindAsync(new object[] { request.Id }, cancellationToken);
            if (shop == null) return false;

            shop.IsActive = false;
            shop.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}
